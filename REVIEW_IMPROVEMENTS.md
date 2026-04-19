# 🛠️ Danh Sách Cải Thiện & Tối Ưu Hóa (Review Findings)

Tài liệu này tổng hợp các điểm cần cải thiện về mặt kiến trúc và mã nguồn sau khi review dự án.

---

## 🏗️ 1. Kiến Trúc Hệ Thống (Architecture)

### 🧩 Module hóa WebRTC Context

- **Vấn đề:** `webrtc.context.svelte.ts` hiện tại là một Singleton quản lý toàn bộ state của tất cả các kết nối. Điều này gây khó khăn nếu muốn mở rộng tính năng đa phòng (Multi-room) hoặc chat nhóm trong tương lai.
- **Giải pháp:** Cấu trúc lại Context để có thể khởi tạo theo từng `roomId`. Sử dụng `Map<string, RoomContext>` thay vì các biến đơn lẻ.

---

## ⚙️ 3. Logic & Hiệu Năng (Logic & Performance)

### 🚀 Kiểm soát Buffer khi đồng bộ dữ liệu (State Sync)

- **Vấn đề:** Hàm `handleSyncReady` đang sử dụng `setTimeout(10ms)` cố định khi gửi batch tin nhắn. Điều này không đảm bảo an toàn nếu `bufferedAmount` vượt quá giới hạn, dẫn đến lag kết nối.
- **Giải pháp:** Sử dụng `waitForBufferDrain` (đã có trong `fileTransfer.ts`) để đợi buffer trống trước khi gửi batch tiếp theo trong vòng lặp sync.

### 🔍 Tối ưu hóa tra cứu Message ID

- **Vấn đề:** Các handler như `handleMessageReact`, `handleMessageDelete` đang lặp qua toàn bộ các phòng (`for (const roomId in nextState)`) để tìm tin nhắn theo ID, gây tốn tài nguyên $O(N \times M)$.
- **Giải pháp:** Bổ sung `roomId` vào payload của mọi tín hiệu điều khiển tin nhắn để truy cập trực tiếp $O(1)$, tương tự như cách đã làm với `handleMessagePin`.

### 🚦 Tránh Race Condition khi Re-transmit File

- **Vấn đề:** `handleFileRequest` khởi tạo một vòng lặp `async` độc lập cho mỗi yêu cầu. Nếu nhận nhiều yêu cầu cùng lúc, các vòng lặp này chạy song song, gây nghẽn I/O khi đọc đĩa và quá tải Data Channel.
- **Giải pháp:** Triển khai cơ chế hàng đợi (Queue) hoặc kiểm tra trạng thái đang gửi cho việc re-transmit từng file cụ thể.

### 🧹 Xử lý ngắt kết nối khi đang truyền file

- **Vấn đề:** Khi `onclose` xảy ra, các file đang nhận dở (`!isPendingDownload`) hiện đang dựa vào timeout của `sweepStaleTransfers` để cập nhật UI.
- **Giải pháp:** Cập nhật trạng thái lỗi hoặc "Sender Offline" ngay lập tức cho các file đang nhận dở khi Data Channel đóng để người dùng không phải chờ.

---

## 🔒 4. Bảo Mật & Ổn Định

### 🛡️ Thêm Rate Limiting cho Data Channel

- **Vấn đề:** Một peer gửi quá nhiều dữ liệu (spam) có thể làm treo trình duyệt của đối tác.
- **Giải pháp:** Thêm logic kiểm tra tần suất nhận tin nhắn/tín hiệu từ mỗi Peer ID trong `messageChannel.ts`.

### 🧪 Mở rộng Unit Test cho Edge Cases

- **Vấn đề:** Cần thêm các test case cho trường hợp mạng bị "flapping" (ngắt kết nối và kết nối lại liên tục) để kiểm tra tính toàn vẹn của Transactional Outbox.

---
