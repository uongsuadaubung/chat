/**
 * Tab Lock - Chỉ cho phép 1 tab duy nhất hoạt động tại một thời điểm
 * Sử dụng Web Locks API hiện đại (Event-driven): 0% idle CPU, không cần polling.
 */
import { log } from '$lib/core/logger';

let lockResolver: (() => void) | null = null;
let isLockedByUs = false;

export async function acquireTabLock(): Promise<boolean> {
  // Trình duyệt cũ hoặc môi trường SSR không hỗ trợ -> Fallback tự do an toàn
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return true;
  }

  // Chống cấp lại nếu đang cầm chìa
  if (isLockedByUs) return true;

  try {
    return await new Promise<boolean>((resolve) => {
      // mode: exclusive (độc quyền), ifAvailable: true (thử lấy, không có thì về luôn không đợi)
      navigator.locks.request(
        'p2p_chat_master_lock',
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          if (!lock) {
            // Trình duyệt từ chối vì đã có tab khác chiếm khoá
            isLockedByUs = false;
            resolve(false);
            return;
          }

          // Sở hữu khoá thành công
          isLockedByUs = true;
          resolve(true);

          // Treo khoá vô thời hạn (0 CPU) cho đến khi releaseTabLock được gọi để resolve Promise
          return new Promise<void>((releaseLock) => {
            lockResolver = releaseLock;
          });
        }
      );
    });
  } catch (e) {
    // Fallback an toàn nếu có lỗi permission v..v
    log.sys.warn('Failed to acquire master tab lock, falling back to permissive mode:', e);
    return true;
  }
}

export function releaseTabLock() {
  if (lockResolver) {
    lockResolver();
    lockResolver = null;
    isLockedByUs = false;
  }
}

// Khi tab đóng hoặc refresh → tự động báo trình duyệt bẻ khoá nhường tab khác
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', releaseTabLock);
}
