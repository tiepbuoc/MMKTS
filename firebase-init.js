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

// ---- Lấy danh sách mã thẻ (duy nhất) đã hoàn thành ít nhất 1 lần ----
async function getDistinctCompletedCardIds() {
  const snap = await db.collection('cardCompletions')
    .where('anonId', '==', getAnonId()).get();
  const ids = new Set();
  snap.forEach(doc => ids.add(doc.data().cardId));
  return Array.from(ids);
}

/* =========================================================
   KIẾN THỨC (mục nội dung Hành trình công dân số) — quản lý qua trang Admin
========================================================= */
async function getKnowledgeSections() {
  const snap = await db.collection('knowledgeSections').orderBy('order', 'asc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function addKnowledgeSection(data) {
  const snap = await db.collection('knowledgeSections').orderBy('order', 'desc').limit(1).get();
  const nextOrder = snap.empty ? 1 : (snap.docs[0].data().order || 0) + 1;
  return db.collection('knowledgeSections').add({
    ...data, order: nextOrder, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}
async function updateKnowledgeSection(id, data) {
  return db.collection('knowledgeSections').doc(id).update(data);
}
async function deleteKnowledgeSection(id) {
  return db.collection('knowledgeSections').doc(id).delete();
}
async function reorderKnowledgeSection(id, newOrder) {
  return db.collection('knowledgeSections').doc(id).update({ order: newOrder });
}

/* =========================================================
   EMO-CONNECT — trò chuyện trực tiếp ẩn danh với cộng tác viên
   Mỗi trình duyệt chỉ biết ID cuộc trò chuyện của chính mình (lưu localStorage),
   nên chỉ máy đó mới xem/gửi được vào đúng cuộc trò chuyện đó.
========================================================= */
function getLocalChatConvId() {
  return localStorage.getItem('emo_chat_conv_id');
}
function setLocalChatConvId(id) {
  localStorage.setItem('emo_chat_conv_id', id);
}
function clearLocalChatConvId() {
  localStorage.removeItem('emo_chat_conv_id');
}

// Tạo cuộc trò chuyện mới, gắn với bản khảo sát vừa gửi (nếu có)
async function createEmoChat(surveyMessageId) {
  const ref = await db.collection('emoChats').add({
    anonId: getAnonId(),
    surveyMessageId: surveyMessageId || null,
    status: 'active',
    deletedByCtv: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastMessagePreview: ''
  });
  setLocalChatConvId(ref.id);
  return ref.id;
}

async function sendEmoChatMessage(convId, sender, text) {
  const chatRef = db.collection('emoChats').doc(convId);
  await chatRef.collection('messages').add({
    sender, text, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await chatRef.update({
    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastMessagePreview: text.slice(0, 120)
  });
}

function listenEmoChatMessages(convId, cb) {
  return db.collection('emoChats').doc(convId).collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

function listenEmoChatMeta(convId, cb) {
  return db.collection('emoChats').doc(convId).onSnapshot(doc => {
    cb(doc.exists ? { id: doc.id, ...doc.data() } : null);
  });
}

// Người dùng bấm "Hủy trò chuyện" — kết thúc phiên hiện tại
async function endEmoChatByUser(convId) {
  await db.collection('emoChats').doc(convId).update({ status: 'ended_by_user' });
  clearLocalChatConvId();
}

// ---- Dành cho trang Cộng tác viên (ctv.html) ----
function listenAllEmoChats(cb) {
  return db.collection('emoChats')
    .where('deletedByCtv', '==', false)
    .orderBy('lastMessageAt', 'desc')
    .onSnapshot(snap => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}
async function ctvDeleteChat(convId) {
  return db.collection('emoChats').doc(convId).update({ deletedByCtv: true });
}
async function getSurveyByAnonId(anonId) {
  const snap = await db.collection('emoConnectMessages')
    .where('anonId', '==', anonId).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getSurveyById(id) {
  const doc = await db.collection('emoConnectMessages').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}
