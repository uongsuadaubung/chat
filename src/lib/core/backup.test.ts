// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, type StoredChatMessage, type ContactRecord } from './db';
import { exportData, importData, type BackupDataJson } from './backup';
import { zipSync, strToU8 } from 'fflate';

if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = async function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = Blob.prototype.arrayBuffer;
}

describe('Backup and Restore (backup.ts)', () => {
  beforeEach(async () => {
    // Xóa db cho mỗi test
    await db.delete();
    await db.open();

    // Dọn dẹp localStorage
    localStorage.clear();

    // Mock các module trình duyệt thiếu trong jsdom
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test-url'),
      revokeObjectURL: vi.fn()
    });

    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true
    });
  });

  afterEach(async () => {
    await db.delete();
    vi.restoreAllMocks();
  });

  it('exportData: Không ném ra ngoại lệ và gọi quy trình tải xuống', async () => {
    // Chuẩn bị dữ liệu mẫu
    localStorage.setItem('username', 'TestUser');
    localStorage.setItem('lang', 'en');

    await db.messages.put({
      id: 'msg-1',
      peerId: 'peer-abc',
      senderId: 'me',
      senderName: 'TestUser',
      isSelf: true,
      timestamp: 1000,
      text: 'Hello test backup'
    } as StoredChatMessage);

    await db.contacts.put({
      peerId: 'peer-abc',
      name: 'Alice',
      color: '#ff0000',
      addedAt: 5000
    } as ContactRecord);

    const fileBlob = new Blob(['sample binary data'], { type: 'text/plain' });
    vi.spyOn(db.files, 'toArray').mockResolvedValue([{ fileId: 'file-123', blob: fileBlob }]);

    // Theo dõi hành vi tạo thẻ <a>
    const createElementSpy = vi.spyOn(document, 'createElement');

    // Chạy export
    await expect(exportData()).resolves.toBeUndefined();

    // Kiểm tra tiến trình download
    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('importData: Khôi phục trọn vẹn dữ liệu từ File zip đã đóng gói', async () => {
    // 1. Tạo tệp giả lập File chuẩn xác format Zip của export
    const backupJson: BackupDataJson = {
      version: 1,
      timestamp: 9999,
      localStorage: {
        username: 'RestoredUser',
        sessionId: 'session-re',
        lang: 'vi',
        app_settings: '{"theme":"dark"}'
      },
      indexedDB: {
        messages: [
          {
            id: 'msg-restore',
            peerId: 'peer-xy',
            senderId: 'peer-xy',
            senderName: 'Bob',
            isSelf: false,
            timestamp: 2000,
            text: 'I am restored'
          }
        ],
        contacts: [
          {
            peerId: 'peer-xy',
            name: 'Bob',
            color: '#0000ff',
            addedAt: 8888
          }
        ]
      }
    };

    const zipObj = {
      'data.json': new Uint8Array(strToU8(JSON.stringify(backupJson))),
      'files/res-file-1': new Uint8Array([1, 2, 3, 4, 5])
    };

    const zippedArray = zipSync(zipObj, { level: 9 });
    const buffer = zippedArray.buffer.slice(
      zippedArray.byteOffset,
      zippedArray.byteOffset + zippedArray.length
    );

    // Duck-type File interface to bypass rigorous JSDOM polyfill issues
    const mockFile = {
      name: 'backup.zip',
      arrayBuffer: async () => buffer
    } as unknown as File;

    const filesPutSpy = vi.spyOn(db.files, 'put');

    // 2. Chạy hàm import
    await importData(mockFile);

    // 3. Kiểm chứng
    expect(window.location.reload).toHaveBeenCalled();

    // Check LocalStorage
    expect(localStorage.getItem('username')).toBe('RestoredUser');
    expect(localStorage.getItem('sessionId')).toBe('session-re');
    expect(localStorage.getItem('lang')).toBe('vi');

    // Check DB Messages
    const msgs = await db.messages.toArray();
    expect(msgs.length).toBe(1);
    expect(msgs[0].id).toBe('msg-restore');
    expect(msgs[0].text).toBe('I am restored');

    // Check DB Contacts
    const contacts = await db.contacts.toArray();
    expect(contacts.length).toBe(1);
    expect(contacts[0].name).toBe('Bob');

    // Check DB Files using Spy to avoid fake-indexeddb Blob POJO conversion issue
    expect(filesPutSpy).toHaveBeenCalled();
    const putArg = filesPutSpy.mock.calls.find((call) => call[0].fileId === 'res-file-1');
    expect(putArg).toBeDefined();

    // Verify it is a valid Blob containing the Uint8Array
    const argBlob = putArg![0].blob as Blob;
    expect(argBlob.size).toBe(5);
  });

  it('importData: Báo lỗi nếu thiếu data.json trong tệp giải nén', async () => {
    const zipObj = {
      'files/res-file-1': new Uint8Array([1, 2, 3])
    };

    const zippedArray = zipSync(zipObj);
    const buffer = zippedArray.buffer.slice(
      zippedArray.byteOffset,
      zippedArray.byteOffset + zippedArray.length
    );

    const mockFile = {
      name: 'fake.zip',
      arrayBuffer: async () => buffer
    } as unknown as File;

    await expect(importData(mockFile)).rejects.toThrow(
      'Không tìm thấy tệp data.json bên trong gói Zip.'
    );
  });
});
