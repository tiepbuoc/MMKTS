# MMKTS Gateway — luồng n8n riêng (cơ chế y hệt POP-AI)

File: `n8n/mmkts-gateway.json` (22 node). Dùng chung n8n và credential `LLM API Key`, nhưng tách biệt hoàn toàn với POP-AI / Mindguard.

| | POP-AI | MMKTS |
|---|---|---|
| Webhook | `/popai-gw-*` | `/mmkts-gw-token`, `/mmkts-gw-chat`, `/mmkts-gw-admin` |
| Tên node | `Config`, `LLM 1`… | `MMKTS Config`, `MMKTS LLM 1`… |
| Firebase xác minh | project `tuanizz` (tài khoản email) | project `metmoikythuatso` (**đăng nhập ẩn danh**) |
| Bộ nhớ / khoá ký token | static data gốc, `iss: popai-gw` | nhánh `mmkts`, `iss: mmkts-gw` |

## Khác POP-AI ở đâu
MMKTS có 2 chỗ dùng AI, nên node `MMKTS Chat Gate` nhận thêm tham số `task` (chỉ nhận `chat` hoặc `classify`, giá trị khác coi là `chat`):
- `chat` — chatbot ở chặng 3 trang Hành trình: prompt "Trợ lý Hành trình công dân số" nằm trong n8n, web chỉ gửi câu hỏi + lịch sử + `context` (điểm sàng lọc của học sinh).
- `classify` — phân loại tin nhắn Emo-Connect vào 1 nhãn. Danh sách nhãn (`classifyCategories`) và prompt nằm trong n8n; không nhận history/context; tin quá dài được cắt bớt thay vì từ chối; không gửi `temperature`.
Prompt hệ thống luôn do **server** quyết định — web không thể tự chèn system prompt.

## Cài đặt
1. **Firebase Console (project `metmoikythuatso`) → Authentication → Sign-in method → bật `Anonymous`.** Nếu quên bước này, web báo "Chưa khởi tạo được phiên ẩn danh".
2. **n8n:** dán 22 node vào workflow POP-AI hiện có (mở `mmkts-gateway.json` → Ctrl+A, Ctrl+C → Ctrl+V trên canvas), hoặc *Import from File* thành workflow riêng. Gán credential `LLM API Key` cho `MMKTS LLM 1/2/3`, lưu, bật Active.
3. **`MMKTS Config`:** sửa `allowedOrigins` thành origin nơi bạn host MMKTS (mặc định `https://tiepbuoc.github.io`), đặt `adminKey` (≥ 16 ký tự, để rỗng = tắt endpoint admin).
4. **Web:** `gateway.js` đã trỏ sẵn tới `https://n8nhosting-67079049.phoaify.com/webhook`; đổi `GATEWAY_BASE_URL` nếu n8n ở nơi khác.

## Kiểm tra nhanh
```bash
H="https://n8nhosting-67079049.phoaify.com/webhook"
curl -i -X POST $H/mmkts-gw-token -H "Origin: https://tiepbuoc.github.io" -d '{"id_token":"abc"}'
# mong đợi 400 bad_request -> webhook đã sống và origin được chấp nhận
```

## Lưu ý
- **Thu hồi API key LLM cũ** (`sk-4150…`) đã nằm công khai trong `emo-connect.html` và `hanh-trinh.html` — tạo key mới ở nhà cung cấp, cập nhật credential `LLM API Key` trong n8n.
- Tin nhắn Emo-Connect (nội dung cảm xúc của học sinh) đi qua n8n và nhà cung cấp LLM để phân loại; giữ *Save successful production executions = Do not save*.
- Cơ chế, mã lỗi, giới hạn: giống `HUONG-DAN-N8N-GATEWAY.md` của POP-AI. Hạn mức (`perUserPerDay`, `dailyTokenCap`…) tính riêng cho MMKTS; mỗi trình duyệt = một người dùng ẩn danh.
