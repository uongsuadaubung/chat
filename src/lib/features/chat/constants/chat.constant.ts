// Số tin nhắn tối đa giữ trong bộ nhớ — cũ hơn sẽ bị xóa
export const MAX_MESSAGE_HISTORY = 200;

// Thời gian chờ trước khi tắt trạng thái "Đang gõ..."
export const TYPING_TIMEOUT_MS = 3000;

// Danh sách các định dạng file đính kèm được phép
export const ACCEPT_IMAGE_VIDEO = 'image/*,video/*';
export const ACCEPT_FILES = 'application/*,text/*,audio/*,.zip,.rar,.7z,.tar,.gz';

// Số lượng tin nhắn được tải thêm mỗi lần cuộn hoặc nhảy đến tin nhắn
export const MESSAGES_CHUNK_SIZE = 50;

// Khoảng cách cuộn (px) tới biên trên/dưới để kích hoạt tải thêm
export const SCROLL_LOAD_THRESHOLD_PX = 50;
export const SCROLL_BOTTOM_THRESHOLD_PX = 100;

// Thời gian debounce (ms) tạm dừng nạp lịch sử
export const HISTORY_LOAD_COOLDOWN_MS = 500;
