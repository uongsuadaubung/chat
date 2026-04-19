# Design Spec: ChatInput Refactoring & Real-time Network Feedback

## 1. Mục tiêu

Tái cấu trúc component `ChatInput.svelte` để cải thiện khả năng bảo trì và bổ sung chỉ báo trạng thái gửi tin nhắn nhằm tăng trải nghiệm người dùng (UX).

## 2. Kiến trúc Component

### 2.1 InputPreviewBanner.svelte (Smart Component)

- **Vị trí:** `src/lib/features/chat/components/InputPreviewBanner.svelte`
- **Trách nhiệm:** Hiển thị preview khi đang trả lời (Reply) hoặc chỉnh sửa (Edit) tin nhắn.
- **Logic:**
  - Sử dụng `$derived` để theo dõi `chatStore.replyingToMessage` và `chatStore.editingMessage`.
  - Cung cấp các hàm xóa trạng thái (`chatStore.setReply(null)`, `chatStore.setEdit(null)`).
- **UI:** Render nội dung tin nhắn gốc, icon loại tin nhắn (nếu là file), và nút đóng.

### 2.2 VoiceRecorder.svelte (Functional Component)

- **Vị trí:** `src/lib/features/chat/components/VoiceRecorder.svelte`
- **Trách nhiệm:** Quản lý vòng đời ghi âm (Start, Pause, Resume, Stop, Cancel).
- **Giao diện (Props):**
  - `onDone: (file: File) => void`: Gọi khi ghi âm hoàn tất thành công.
  - `onCancel: () => void`: Gọi khi hủy ghi âm.
- **Internal State:** `mediaRecorder`, `audioChunks`, `recordingDuration`, `isPaused`.
- **UI:** Chứa `AudioVisualizer`, bộ đếm thời gian, các nút điều khiển (Pause/Play, Trash/Cancel).

### 2.3 AttachmentManager.svelte (Asset Management)

- **Vị trí:** `src/lib/features/chat/components/AttachmentManager.svelte`
- **Trách nhiệm:** Quản lý các file đính kèm, menu đính kèm và xử lý clipboard (Paste).
- **Giao diện (Props):**
  - `onFileSelect: (file: File) => void`: Trả về file đã chọn từ máy tính.
  - `pendingImage: File | null` (bindable): File ảnh đang chờ được gửi kèm caption.
- **Internal State:** `fileInputEl`, `pendingImagePreviewUrl`.
- **UI:** `AttachMenu`, `EmojiMenu`, hidden `input[type="file"]`, và preview ảnh paste từ clipboard.

### 2.4 ChatInput.svelte (Orchestrator)

- **Vị trí:** `src/lib/features/chat/components/ChatInput.svelte`
- **Trách nhiệm:** Điều phối các component con, quản lý văn bản nhập (`textInput`), trạng thái typing và gửi tin nhắn cuối cùng.
- **Logic:**
  - Tích hợp `InputPreviewBanner`, `VoiceRecorder`, và `AttachmentManager`.
  - Hàm `send()`: Tổng hợp `textInput` và `pendingImage` từ `AttachmentManager` để quyết định gửi tin nhắn text, ảnh kèm caption, hoặc edit tin nhắn.

## 3. Phản hồi lỗi mạng thời gian thực (Real-time Feedback)

### 3.1 Trạng thái "Pending" cho Tin nhắn

- **Vấn đề:** Người dùng không biết tin nhắn đã thực sự được gửi đi hay chưa khi mạng chập chờn.
- **Giải pháp:**
  - Thêm field `isPending` vào interface tin nhắn (local state).
  - Khi gửi tin nhắn qua `webrtc.sendChat`, tin nhắn đó sẽ có trạng thái `isPending = true`.
  - Khi nhận được ACK từ Peer thông qua Data Channel (hoặc khi Transaction Outbox hoàn tất), cập nhật `isPending = false`.
- **UI (`MessageBubble.svelte`):**
  - Hiển thị một icon nhỏ (ví dụ: đồng hồ cát hoặc vòng xoay mờ) cạnh tin nhắn nếu `isPending === true`.

## 4. Kế hoạch Kiểm thử

- **Unit Test:** Kiểm tra logic callback của `VoiceRecorder` và `AttachmentManager`.
- **Integration Test:** Đảm bảo `ChatInput` nhận đúng file từ các component con và gửi qua `webrtc`.
- **Manual Test:**
  - Ghi âm và gửi.
  - Paste ảnh từ clipboard, nhập caption và gửi.
  - Chỉnh sửa tin nhắn, trả lời tin nhắn.
  - Giả lập mất mạng để xem icon "Pending" xuất hiện.
