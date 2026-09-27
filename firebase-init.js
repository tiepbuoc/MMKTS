// ===== Cấu hình Firebase (dùng chung cho toàn bộ website) =====
const firebaseConfig = {
  apiKey: "AIzaSyB62F4_ClybBFPqXEPUvbVK5ySfuWrAaz4",
  authDomain: "metmoikythuatso.firebaseapp.com",
  projectId: "metmoikythuatso",
  storageBucket: "metmoikythuatso.firebasestorage.app",
  messagingSenderId: "25009835444",
  appId: "1:25009835444:web:6fa8f014d1bad356fa76e1",
  measurementId: "G-HTFBVPL7H9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---- ID ẩn danh lưu ở trình duyệt học sinh (không thu thập họ tên) ----
function getAnonId() {
  let id = localStorage.getItem('hs_anon_id');
  if (!id) {
    id = 'hs_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('hs_anon_id', id);
  }
  return id;
}

// ---- Lưu kết quả bài sàng lọc mệt mỏi kỹ thuật số ----
async function saveScreeningResult(avgScore, level, answers) {
  return db.collection('screeningResults').add({
    anonId: getAnonId(),
    avgScore, level, answers,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ---- Lưu tin nhắn ẩn danh Emo-Connect ----
async function saveEmoMessage(data) {
  return db.collection('emoConnectMessages').add({
    ...data,
    anonId: getAnonId(),
    status: 'moi',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ---- Ghi nhận thẻ Mindful Chain đã hoàn thành ----
async function saveCardCompletion(cardId, cardName, group) {
  return db.collection('cardCompletions').add({
    anonId: getAnonId(),
    cardId, cardName, group,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ---- Đếm số thẻ đã hoàn thành của học sinh này (để dựng chuỗi) ----
async function getChainLength() {
  const snap = await db.collection('cardCompletions')
    .where('anonId', '==', getAnonId()).get();
  return snap.size;
}
