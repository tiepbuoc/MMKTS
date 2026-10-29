# MMKTS

Website tĩnh (Firebase Firestore) cho chương trình "Hành trình công dân số".

## AI qua n8n
AI (chatbot ở `hanh-trinh.html`, phân loại tin nhắn ở `emo-connect.html`) chạy qua **MMKTS Gateway** trên n8n — web không giữ API key LLM.
- `gateway.js` — client gọi gateway (đăng nhập Firebase ẩn danh → xin token 5 phút → hỏi AI).
- `n8n/mmkts-gateway.json` — luồng n8n riêng của MMKTS; hướng dẫn ở `n8n/HUONG-DAN-MMKTS-GATEWAY.md`.
- Cần bật **Authentication → Anonymous** trong Firebase project `metmoikythuatso`.
