import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { db, type StoredChatMessage, type ContactRecord } from './db';
import { log } from './logger';

export interface BackupDataJson {
  version: number;
  timestamp: number;
  localStorage: {
    username?: string;
    sessionId?: string;
    lang?: string;
    app_settings?: string;
  };
  indexedDB: {
    messages: StoredChatMessage[];
    contacts: ContactRecord[];
  };
}

/**
 * Xuất toàn bộ dữ liệu ra một file zip (bao gồm JSON cấu trúc và thư mục files nguyên gốc)
 */
export async function exportData(): Promise<void> {
  try {
    log.sys.info('Bắt đầu sao lưu toàn bộ dữ liệu...');
    const localData = {
      username: localStorage.getItem('username') || undefined,
      sessionId: localStorage.getItem('sessionId') || undefined,
      lang: localStorage.getItem('lang') || undefined,
      app_settings: localStorage.getItem('app_settings') || undefined
    };

    const backupJson: BackupDataJson = {
      version: 1,
      timestamp: Date.now(),
      localStorage: localData,
      indexedDB: {
        messages: await db.messages.toArray(),
        contacts: await db.contacts.toArray()
      }
    };

    const zipObj: Record<string, Uint8Array> = {
      'data.json': new Uint8Array(strToU8(JSON.stringify(backupJson)))
    };

    const files = await db.files.toArray();
    for (const fileRecord of files) {
      if (fileRecord.blob) {
        let buffer: ArrayBuffer;
        if (typeof fileRecord.blob.arrayBuffer === 'function') {
          buffer = await fileRecord.blob.arrayBuffer();
        } else {
          buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(fileRecord.blob);
          });
        }
        zipObj[`files/${fileRecord.fileId}`] = new Uint8Array(buffer);
      }
    }

    const zipped = zipSync(zipObj, { level: 9 });
    const blob = new Blob([new Uint8Array(zipped)], { type: 'application/zip' });

    // Download it
    const date = new Date().toISOString().split('T')[0];
    const filename = `P2PChat_Backup_${date}.zip`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);

    log.sys.info('Sao lưu thành công.');
  } catch (err) {
    log.sys.error('Lỗi khi sao lưu dữ liệu:', err);
    throw new Error('Lỗi sao lưu', { cause: err });
  }
}

/**
 * Đọc file zip, phân tách JSON lấy cấu hình và nhét lại vào db/storage
 */
export async function importData(file: File): Promise<void> {
  try {
    log.sys.info('Bắt đầu khôi phục dữ liệu từ tệp zip:', file.name);
    const arrayBuffer = await file.arrayBuffer();
    const uint8Arr = new Uint8Array(arrayBuffer);
    const unzipped = unzipSync(uint8Arr);

    // Validate data.json exists
    if (!unzipped['data.json']) {
      throw new Error('Không tìm thấy tệp data.json bên trong gói Zip.');
    }

    const dataJsonContent = strFromU8(unzipped['data.json']);
    const backupJson = JSON.parse(dataJsonContent) as BackupDataJson;

    // We can wipe currently active Indexeddb tables first, and insert everything.
    await db.transaction('rw', db.messages, db.contacts, db.files, async () => {
      // Clear all
      await db.messages.clear();
      await db.contacts.clear();
      await db.files.clear();

      // Put messages & contacts
      if (backupJson.indexedDB?.messages) {
        await db.messages.bulkPut(backupJson.indexedDB.messages);
      }
      if (backupJson.indexedDB?.contacts) {
        await db.contacts.bulkPut(backupJson.indexedDB.contacts);
      }

      // Reconstruct files
      const fileKeys = Object.keys(unzipped).filter(
        (key) => key.startsWith('files/') && key !== 'files/'
      );
      for (const fileKey of fileKeys) {
        const fileId = fileKey.replace('files/', '');
        const fileUint8 = unzipped[fileKey];
        // We do not have mime type natively backed up for each file blob here...
        // But IndexedDB just needs a raw blob. It's best if we check original message payloads to guess mime type if really needed.
        // Usually `type: 'application/octet-stream'` works or we can leave it empty.
        const blob = new Blob([new Uint8Array(fileUint8)]);
        await db.files.put({ fileId, blob });
      }
    });

    // Apply localStorage
    if (backupJson.localStorage) {
      if (backupJson.localStorage.username !== undefined) {
        localStorage.setItem('username', backupJson.localStorage.username);
      } else {
        localStorage.removeItem('username');
      }

      if (backupJson.localStorage.sessionId !== undefined) {
        localStorage.setItem('sessionId', backupJson.localStorage.sessionId);
      } // Never delete session ID otherwise the app generates a new one.

      if (backupJson.localStorage.lang !== undefined) {
        localStorage.setItem('lang', backupJson.localStorage.lang);
      }
      if (backupJson.localStorage.app_settings !== undefined) {
        localStorage.setItem('app_settings', backupJson.localStorage.app_settings);
      }
    }

    log.sys.info('Khôi phục thành công! Đang tải lại ứng dụng...');
    // Request app reload to apply new localstorage values across stores seamlessly
    window.location.reload();
  } catch (err: unknown) {
    log.sys.error('Lỗi khi khôi phục dữ liệu:', err);
    throw err;
  }
}
