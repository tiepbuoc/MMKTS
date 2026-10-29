/**
 * Gọi AI qua MMKTS Gateway (n8n) — thay cho việc gọi thẳng nhà cung cấp LLM từ trình duyệt.
 * KHÔNG có API key LLM ở web: key thật chỉ nằm trong Credentials của n8n.
 *
 * Luồng (giống POP-AI):
 *  1. Đăng nhập Firebase ẨN DANH (không thu thập họ tên/email) -> lấy ID token.
 *  2. Gửi {id_token, page_url} tới /mmkts-gw-token -> nhận token sống ~5 phút.
 *  3. Gọi /mmkts-gw-chat kèm token -> n8n kiểm tra, gọi LLM và trả lời.
 *
 * Cần nạp trước: firebase-app-compat, firebase-auth-compat, firebase-init.js
 * Dùng: MMKTSGateway.askGateway({ task:'chat'|'classify', message, history, context })
 */
(function () {
  // URL gốc webhook n8n (không có "/" ở cuối)
  const GATEWAY_BASE_URL = "https://n8nhosting-67079049.phoaify.com/webhook";

  const RENEW_BEFORE_MS = 60 * 1000;   // còn dưới 60s thì xin token mới trước khi gọi

  let cached = null;     // { token, expMs }
  let inflight = null;   // chống gọi trùng khi nhiều nơi cùng xin token

  class GatewayError extends Error {
    constructor(code, status) { super(code); this.code = code; this.status = status || 0; }
  }

  async function postJson(path, body) {
    let res;
    try {
      res = await fetch(GATEWAY_BASE_URL + path, {
        method: "POST",
        // text/plain = "simple request": trình duyệt không gửi preflight (OPTIONS) tới n8n.
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new GatewayError("network_error");
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* phản hồi không phải JSON */ }
    return { status: res.status, data };
  }

  // Lấy (hoặc tạo) người dùng ẩn danh của Firebase rồi trả về ID token
  async function getFirebaseIdToken() {
    if (!window.firebase || !firebase.auth) throw new GatewayError("auth_sdk_missing");
    const auth = firebase.auth();
    // đợi Firebase khôi phục phiên cũ (nếu có) để khỏi tạo thừa tài khoản ẩn danh
    let user = await new Promise(resolve => {
      const off = auth.onAuthStateChanged(u => { off(); resolve(u); });
    });
    if (!user) {
      try { user = (await auth.signInAnonymously()).user; }
      catch (e) { throw new GatewayError("auth_failed"); }
    }
    return user.getIdToken();
  }

  async function fetchToken() {
    const idToken = await getFirebaseIdToken();
    const { status, data } = await postJson("/mmkts-gw-token", {
      id_token: idToken,
      page_url: location.href
    });
    if (status !== 200 || !data || !data.token) {
      throw new GatewayError((data && data.error) || "token_http_" + status, status);
    }
    const ttlMs = (Number(data.expires_in) || 300) * 1000;
    cached = { token: data.token, expMs: Date.now() + ttlMs };
    return cached.token;
  }

  /** Đảm bảo có token còn hạn; force=true để bắt buộc xin mới. */
  function ensureToken(force) {
    if (!force && cached && cached.expMs - Date.now() > RENEW_BEFORE_MS) return Promise.resolve(cached.token);
    if (!inflight) inflight = fetchToken().finally(() => { inflight = null; });
    return inflight;
  }

  /** Gọi sớm khi trang tải xong để lần hỏi đầu không phải chờ xin token. */
  function prefetchToken() { ensureToken(false).catch(() => {}); }

  /** Thông báo lỗi thân thiện bằng tiếng Việt cho học sinh. */
  function friendlyError(err) {
    const code = (err && err.code) || "";
    const map = {
      network_error: "Không kết nối được tới trợ lý, hãy kiểm tra mạng rồi thử lại.",
      auth_failed: "Chưa khởi tạo được phiên ẩn danh, hãy tải lại trang rồi thử lại.",
      auth_sdk_missing: "Trang chưa nạp đủ thành phần, hãy tải lại trang.",
      user_rate_limit: "Bạn gửi hơi nhanh, đợi một chút rồi hỏi tiếp nhé.",
      user_daily_limit: "Hôm nay bạn đã dùng hết lượt hỏi trợ lý. Mai quay lại nhé!",
      web_daily_cap: "Hôm nay trợ lý đã hết lượt dùng. Thử lại vào ngày mai nhé.",
      daily_cap_reached: "Hôm nay trợ lý đã hết lượt dùng. Thử lại vào ngày mai nhé.",
      gateway_disabled: "Trợ lý đang tạm dừng để bảo trì. Thử lại sau nhé.",
      message_too_long: "Tin nhắn quá dài, hãy rút gọn lại.",
      too_many_requests: "Có quá nhiều yêu cầu, đợi một chút rồi thử lại.",
      llm_unavailable: "Trợ lý đang quá tải, thử lại sau ít phút nhé."
    };
    return map[code] || ("Trợ lý đang gặp sự cố (" + (code || "lỗi không rõ") + "). Thử lại sau nhé.");
  }

  /**
   * Gửi câu hỏi tới AI.
   * @param {{task?:'chat'|'classify', message:string, history?:{role:string,content:string}[], context?:string}} p
   *   history = các lượt TRƯỚC đó (không gồm `message`). context = dữ liệu học sinh để cá nhân hóa (chỉ dùng cho task chat).
   * @returns {Promise<string>} nội dung trả lời
   */
  async function askGateway(p) {
    const { task = "chat", message, history = [], context = "" } = p;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await ensureToken(attempt > 0);
      const { status, data } = await postJson("/mmkts-gw-chat", {
        token, task, message, history, context, page_url: location.href
      });
      if (status === 200 && data && typeof data.reply === "string") return data.reply;
      const code = (data && data.error) || "http_" + status;
      // token hết hạn/không hợp lệ -> xin token mới và thử lại đúng 1 lần
      if (status === 401 && attempt === 0) { cached = null; continue; }
      throw new GatewayError(code, status);
    }
    throw new GatewayError("token_refresh_failed");
  }

  window.MMKTSGateway = { askGateway, prefetchToken, friendlyError, GatewayError };
})();
