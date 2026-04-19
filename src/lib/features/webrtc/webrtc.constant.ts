export const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // TURN servers phục vụ kết nối khi mDNS hoặc NAT loopback cản trở trên cùng WiFi
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

export const COLORS = [
  '#f44336',
  '#e91e63',
  '#9c27b0',
  '#673ab7',
  '#3f51b5',
  '#2196f3',
  '#00bcd4',
  '#009688',
  '#4caf50',
  '#ff9800',
  '#ff5722'
];

// Giới hạn kích thước message — DataChannel có buffer limit (~256KB tùy browser)
export const MAX_MESSAGE_BYTES = 64 * 1024;

// Giới hạn kích thước chunk khi băm file gửi đi
export const FILE_CHUNK_SIZE = 64 * 1024;

// Ngưỡng dung lượng lớn nhất cho phép tự động tải file Media (ảnh, video)
export const AUTO_DOWNLOAD_MAX_SIZE = 10 * 1024 * 1024;

// Ngưỡng tối đa cho bộ đệm buffer của WebRTC DataChannel (tránh nghẽn mạng)
export const MAX_WEBRTC_BUFFER = 16 * 1024 * 1024;

// Số lần retry tối đa khi ICE connection failed (backoff: 1s, 2s, 3s...)
export const MAX_ICE_RETRIES = 3;

// Thời gian chờ trước khi tự động tạo lại kết nối (sau khi hết ICE retries)
export const RECONNECT_DELAY_MS = 5000;

// Thời gian Ping định kỳ để giữ kết nối tránh NAT Timeout (15s)
export const KEEP_ALIVE_INTERVAL_MS = 15000;

// Số lượng tin nhắn trong một batch đồng bộ
export const SYNC_BATCH_SIZE = 50;

// Binary ACK magic byte — phân biệt binary file chunk vs binary ACK batch
export const ACK_MAGIC_BYTE = 0xac;

// Khoảng thời gian gom ACK thành batch trước khi gửi (ms)
export const ACK_BATCH_INTERVAL_MS = 50;

// Binary file chunk protocol — header format: [36 bytes fileId][4 bytes chunkIndex][...data]
export const FILE_ID_BYTES = 36; // UUID string length in ASCII
export const FILE_CHUNK_HEADER_BYTES = 40; // FILE_ID_BYTES + 4 bytes chunkIndex (Uint32)

// Số lượng chunk tối đa trong flight (chưa được ACK) trước khi yield event loop
export const IN_FLIGHT_LIMIT = 256;

// Thời gian chờ để giải phóng socket cũ trước khi reconnect (ms)
export const RETRY_SOCKET_DRAIN_MS = 300;

// Thời gian tối đa một transfer được phép không có tiến độ trước khi bị coi là stale
export const STALE_TRANSFER_TIMEOUT_MS = 5 * 60 * 1000; // 5 phút

// Tần suất sweep kiểm tra stale transfers
export const STALE_TRANSFER_SWEEP_MS = 60 * 1000; // Mỗi 1 phút
