# 🚀 P2P WebRTC Chat

Một ứng dụng trò chuyện Peer-to-Peer (P2P) hoàn toàn phi tập trung và bảo mật, được xây dựng với **Svelte 5**, **TypeScript**, và sức mạnh của **WebRTC**.

Dự án này **không lưu trữ bất kỳ tin nhắn hay tệp tin nào của bạn trên máy chủ**. Firebase Realtime Database chỉ được sử dụng ở giai đoạn đầu như một trạm trung chuyển (Signaling Server) để hai người dùng tìm thấy nhau. Khi kết nối thành công, toàn bộ dữ liệu bay trực tiếp từ máy bạn sang máy người nhận thông qua công nghệ WebRTC DataChannel, và được bảo lưu tuyệt mật tại **IndexedDB** ngay bên trong trình duyệt của bạn.

---

## ✨ Tính Năng Nổi Bật

- **🔒 Trò chuyện ngang hàng (P2P):** Tự động mã hóa đầu cuối (E2EE) qua WebRTC. Không có máy chủ trung gian nào có thể đọc được tin nhắn của bạn.
- **💾 Lưu trữ cục bộ & Tự động hồi phục (F5 Recovery):** Toàn bộ tin nhắn và dữ liệu được lưu an toàn vào **IndexedDB** máy tính bạn. Tha hồ tải lại trang (F5) mà không lo bay sạch chat! App thậm chí còn có "Outbox" giúp tự động gửi lại các tin nhắn ngầm và nối máy resume tiếp các file bị rớt mạng chập chờn.
- **📦 Xuất/Nhập dữ liệu (Data Export/Import):** Dễ dàng sao lưu và khôi phục toàn bộ lịch sử trò chuyện cục bộ thông qua tệp JSON, đảm bảo bạn luôn làm chủ dữ liệu của chính mình.
- **📌 Ghim tin nhắn (Pinned Messages):** Ghim các tin nhắn quan trọng vào thanh Sidebar để xem lại dễ dàng, hiển thị và đồng bộ với cả hai bên theo thời gian thực.
- **🎤 Tin Nhắn Thoại (Voice Message):** Ghi âm trực tiếp và gửi tin nhắn thoại qua trình duyệt đi kèm hiệu ứng sóng âm (Audio Visualizer) sinh động, uyển chuyển theo thời gian thực.
- **📁 Gửi File Không Giới Hạn & Non-blocking:** Truyền tải tệp tin, hình ảnh có dung lượng lớn. Hệ thống tự động chia nhỏ file (Chunking) và sử dụng **Web Worker** dưới nền để đảm bảo giao diện luôn mượt mà. Hỗ trợ Tạm dừng (Pause), Tiếp tục (Resume) và Hủy (Cancel).
- **🔗 Messenger Trực Tiếp 1-1 (Link-based):** Từ bỏ mô hình phòng chat phức tạp. Bạn được cấp tự động 1 Định danh vô danh (Session ID) và 1 đường link chia sẻ. Khi đối tác ấn vào link, hai thiết bị sẽ bắt tay nhau thiết lập kênh giao tiếp P2P riêng tư ngay lập tức.
- **🎨 Giao Diện "Glassmorphism" Hiện Đại:** Thiết kế trong suốt tuyệt đẹp kèm chế độ Sáng/Tối. Tích hợp hệ thống thông báo trạng thái cực kì bắt mắt và đồng bộ hóa **Hình đại diện (Universal Avatars)** xuyên suốt ứng dụng.
- **🌍 Đa Ngôn Ngữ (i18n):** Hỗ trợ Tiếng Việt (🇻🇳) và Tiếng Anh (🇺🇸) out-of-the-box.
- **🛡️ Tab Lock:** Thuật toán chống mở nhiều tab thông minh để ngăn chặn việc xung đột ID thiết bị WebRTC.
- **⚙️ Tự động hóa & Chất lượng mã (QA):** Bảo vệ cam kết mã nguồn nghiêm ngặt bằng Eslint, Prettier và chuỗi Unit Tests tích hợp sẵn trên Vitest thông qua móc chặn vòng đời (Husky Pre-commit).
- **🚀 Triển khai & CI/CD tự động:** Hệ thống tự động nâng cấp phiên bản và dọn dẹp rác (lịch sử Deploy cũ) trên GitHub thông qua tính năng GitHub Actions khi khởi tạo một phân bản Release mới.

---

## 🛠️ Công Nghệ Sử Dụng

- **Frontend Framework:** [Svelte 5](https://svelte.dev/) (Sử dụng kiến trúc Runes `$state`, `$derived`, v.v.)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Ngôn ngữ:** TypeScript
- **Cơ sở dữ liệu cục bộ (Local Persistence):** IndexedDB qua wrapper [Dexie](https://dexie.org/)
- **Trạm mồi kết nối (Signaling):** Firebase Realtime Database
- **Kiến trúc P2P:** WebRTC (`RTCPeerConnection`, `RTCDataChannel`)

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Tại Máy (Local)

### 1. Yêu cầu trước

- [Node.js](https://nodejs.org/en/) (phiên bản 18+ khuyến nghị)
- Một dự án [Firebase](https://firebase.google.com/) trống với Realtime Database được bật.

### 2. Cài đặt các thư viện

```bash
# Clone source code hoặc tải về máy
cd chat

# Cài đặt các gói phụ thuộc
npm install
```

### 3. Cấu hình biến môi trường

Mở thư mục gốc của dự án, copy file `.env.example` thành file `.env`:

```bash
cp .env.example .env
```

Điền các thông số từ bảng điều khiển Firebase của bạn vào file `.env`:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your_project_id.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Khởi chạy

```bash
# Bật server dev tại localhost
npm run dev
```

### 5. Kiểm thử & Dọn dẹp (Linting)

```bash
# Kiểm tra văn phong code
npm run lint
npm run format

# Chạy Unit Test kiểm thử WebRTC & Logic
npm run test
```

_\*Lưu ý: Bạn không cần nhớ chạy thủ công chúng, Husky `pre-commit` hook sẽ tự động chạy lint và test mỗi khi bạn ấn lệnh `git commit`._

### 6. Build & Deploy (CI/CD Production)

Nếu bạn là chủ Repo, đơn giản bạn chỉ cần:

1. PUSH code thoải mái lên nhánh `main`.
2. Tạo một **Release** mới bằng Web UI của GitHub.
3. Github Action sẽ tự động chạy script `scripts/bump-version.mjs`, vá lại code phiên bản mới nhất, biên dịch web thông qua lệnh Build, tải lên gh-pages và dọn dẹp mọi tàn tích lỗi cũ!

---

## 🗺️ Bản Đồ Mã Nguồn (Codebase Map)

> Dành cho Lập trình viên / AI muốn tham gia đóng góp hoặc đọc mã nguồn.

Vui lòng đọc file **[CODEBASE_MAP.md](./CODEBASE_MAP.md)** tại thư mục gốc. File này chứa toàn bộ hệ thống sơ đồ kiến trúc, nguyên lý trao đổi dữ liệu, cấu trúc thư mục, quy tắc đặt tên (`naming conventions`) và luật bất thành văn (kiến trúc chạy Svelte 5).

> **Lưu ý quy tắc (Agent Rule):** Hãy thực hiện đọc `CODEBASE_MAP.md` trước khi sửa source code bất kỳ để tránh xung đột cấu trúc!

---

## 📖 Cơ Chế Hoạt Động Căn Bản (WebRTC Flow)

1. **Tạo Định Danh:** Khi mở App, hệ thống tự cấp cho bạn một Session ID ngẫu nhiên. Bạn chỉ cần nhập một tên gọi (Nickname) để xưng hô.
2. **Chia sẻ Liên Kết (Share Link):** Nhấn nút Copy Share Link (chứa tham số '?p=ID_của_bạn') và gửi cho người cần Chat.
3. **Offer / Answer:** Khi người thứ hai truy cập Link, thiết bị sẽ tự động gửi lời chào (Offer SDP) tới Session ID của bạn thông qua nhánh `signals` trên Firebase. Hệ thống WebRTC của bạn bắt được tín hiệu và tự động đổ lời hồi đáp (Answer SDP).
4. **Trao tay (ICE Candidate):** Hai thiết bị tự động tuồn cho nhau bản đồ mạng LAN / Cổng Router (ICE) trên môi trường internet để dò đường đi ngắn nhất.
5. **P2P Connected:** Đàm phán hoàn tất! Kể từ giây phút này, trạm nối Firebase hoàn toàn bị phớt lờ. Hai bên tự động mở đường hầm liên kết `DataChannel` để giao tiếp và quăng file trực tiếp cho nhau. Nếu chẳng may mạng rớt hay lỡ tay F5 trình duyệt, cơ chế IndexedDB kết hợp vòng lặp Queue sẽ giúp hai bên tự nối lại trạm và khôi phục mảng hội thoại mà không mất một byte nào.

_Vui vẻ code & chat nhé!_ 🐱
