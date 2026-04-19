import { getFileBlobFromDB } from '$lib/core/db';
import { log } from '$lib/core/logger';

interface CacheItem {
  url: string;
  count: number;
}

class BlobCacheManager {
  private cache = new Map<string, CacheItem>();
  private pending = new Map<string, Promise<string | undefined>>();

  /**
   * Xin cấp URL cho 1 fileId. Nếu đã có thì ++count, chưa có thì fetch DB.
   */
  async acquire(id: string): Promise<string | undefined> {
    const item = this.cache.get(id);
    if (item) {
      item.count++;
      return item.url;
    }

    // Chống Race Condition: 2 Component cùng xin cấp URL 1 lúc
    if (this.pending.has(id)) {
      const url = await this.pending.get(id);
      if (url) {
        const updatedItem = this.cache.get(id);
        if (updatedItem) updatedItem.count++;
      }
      return url;
    }

    const promise = (async () => {
      try {
        const blob = await getFileBlobFromDB(id);
        if (!blob) return undefined;
        const url = URL.createObjectURL(blob);
        // Để count = 0, hàm gọi bên ngoài sẽ ++count khi await xong
        this.cache.set(id, { url, count: 0 });
        return url;
      } catch (e) {
        log.dc.error(`[BlobCache] Failed to acquire blob for ${id}`, e);
        return undefined;
      } finally {
        this.pending.delete(id);
      }
    })();

    this.pending.set(id, promise);
    const url = await promise;
    if (url) {
      const finalItem = this.cache.get(id);
      if (finalItem) finalItem.count++;
    }
    return url;
  }

  /**
   * Đăng ký ngay 1 Blob có sẵn (trong quá trình Gửi hoặc sau khi Nhận xong).
   */
  register(id: string, blob: Blob): string {
    const item = this.cache.get(id);
    if (item) {
      return item.url;
    }
    const url = URL.createObjectURL(blob);
    this.cache.set(id, { url, count: 1 }); // Component tạo ra nó sẽ sở hữu 1 ref
    return url;
  }

  /**
   * Giải phóng 1 tham chiếu. Nếu đạt 0, dọn dẹp RAM.
   */
  release(id: string) {
    const item = this.cache.get(id);
    if (!item) return;

    item.count--;
    if (item.count <= 0) {
      URL.revokeObjectURL(item.url);
      this.cache.delete(id);
    }
  }
}

export const blobCache = new BlobCacheManager();
