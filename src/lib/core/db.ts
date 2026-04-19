import Dexie, { type Table } from 'dexie';
import type { ChatMessage } from '$lib/features/chat/types/chat.type';
import type { TransactionalOutboxRecord } from '$lib/features/webrtc/transaction.type';
import { log } from '$lib/core/logger';

export interface ContactRecord {
  peerId: string; // primary key
  name: string;
  color: string;
  addedAt: number;
}

export class DatabaseError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'DatabaseError';
  }
}

export type StoredChatMessage = ChatMessage;

export class P2PChatDatabase extends Dexie {
  messages!: Table<StoredChatMessage, string>;
  files!: Table<{ fileId: string; blob: Blob }, string>;
  contacts!: Table<ContactRecord, string>;
  transactional_outbox!: Table<TransactionalOutboxRecord, number>;

  constructor() {
    super('P2P_Chat_DB');
    // Version 1 - reset app, all data cleared on upgrade
    this.version(1).stores({
      messages: 'id, peerId, [peerId+timestamp], timestamp, isDeleted, type, isPinned',
      files: 'fileId',
      contacts: 'peerId, addedAt',
      transactional_outbox: '++id, peerId, status, createdAt'
    });

    // Version 2 - Standardize on peerId for messages and transactional_outbox
    this.version(2).stores({
      messages: 'id, peerId, [peerId+timestamp], timestamp, isDeleted, type, isPinned',
      transactional_outbox: '++id, peerId, status, createdAt'
    });
  }
}

export const db = new P2PChatDatabase();

// --- Database Abstractions ---

/**
 * Saves a message to IndexedDB or updates it if it exists.
 * In a background promise to not block the main thread.
 */
export async function saveMessageToDB(message: ChatMessage): Promise<void> {
  try {
    if (!message.peerId) {
      throw new DatabaseError(`Không thể lưu tin nhắn vì thiếu peerId. Message ID: ${message.id}`);
    }

    // Create a safe copy of the message for IndexedDB
    // We need to handle file objects specially since they may contain non-serializable properties
    const messageForDB: StoredChatMessage = { ...message };

    // If the message has a file attachment, we need to ensure it's serializable
    if (message.file) {
      // Create a clean file object with only serializable properties
      messageForDB.file = {
        name: message.file.name,
        size: message.file.size,
        mimeType: message.file.mimeType,
        url: message.file.url,
        progress: message.file.progress,
        isReceiving: message.file.isReceiving,
        isSending: message.file.isSending,
        isPendingDownload: message.file.isPendingDownload,
        isExpired: message.file.isExpired,
        error: message.file.error,
        transferRate: message.file.transferRate
      };
    }

    await db.messages.put(messageForDB);
  } catch (err) {
    log.db.error('Lỗi lưu tin nhắn:', err);
    throw new DatabaseError(`Không thể lưu tin nhắn: ${message.id}`, err);
  }
}

/**
 * Load all stored messages for a specific peer
 */
export async function loadMessagesForPeerFromDB(peerId: string): Promise<StoredChatMessage[]> {
  try {
    const msgs = await db.messages
      .where('[peerId+timestamp]')
      .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
      .toArray();
    return msgs;
  } catch (err) {
    log.db.error(`Lỗi load tin nhắn cho peer ${peerId}:`, err);
    throw new DatabaseError(`Không thể load tin nhắn cho peer: ${peerId}`, err);
  }
}

/**
 * Save a raw binary Blob to the files table
 */
export async function saveFileBlobToDB(fileId: string, blob: Blob): Promise<void> {
  try {
    await db.files.put({ fileId, blob });
  } catch (err) {
    log.db.error('Lỗi lưu file blob:', err);
    throw new DatabaseError(`Không thể lưu file blob: ${fileId}`, err);
  }
}

/**
 * Retrieve a file Blob from the DB
 */
export async function getFileBlobFromDB(fileId: string): Promise<Blob | undefined> {
  try {
    const record = await db.files.get(fileId);
    return record?.blob;
  } catch (err) {
    log.db.error('Lỗi tải file blob:', err);
    throw new DatabaseError(`Không thể tải file blob: ${fileId}`, err);
  }
}

/**
 * Remove a file Blob from the DB to free up storage
 */
export async function deleteFileBlobFromDB(fileId: string): Promise<void> {
  try {
    await db.files.delete(fileId);
  } catch (err) {
    log.db.error('Lỗi xóa file blob:', err);
    throw new DatabaseError(`Không thể xóa file blob: ${fileId}`, err);
  }
}

/**
 * Tìm kiếm tin nhắn theo keyword
 * - Filter type='text' trước để giảm số lượng scan
 * - Filter isDeleted để loại tin nhắn đã xóa
 */
export async function searchMessages(
  peerId: string,
  keyword: string
): Promise<StoredChatMessage[]> {
  try {
    const lowerKeyword = keyword.toLowerCase();
    if (!lowerKeyword) return [];

    const msgs = await db.messages
      .where('[peerId+timestamp]')
      .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
      .and(
        (msg) =>
          (msg.type === 'text' || msg.type === 'file') &&
          msg.isDeleted !== true &&
          Boolean(msg.text?.toLowerCase().includes(lowerKeyword))
      )
      .toArray();

    return msgs.reverse();
  } catch (err) {
    log.db.error(`Lỗi tìm kiếm tin nhắn cho peer ${peerId}:`, err);
    throw new DatabaseError(`Không thể tìm kiếm tin nhắn cho peer: ${peerId}`, err);
  }
}

/**
 * Mở rộng: Lấy các tin nhắn có chữa file đính kèm
 */
export async function getSharedFiles(peerId: string): Promise<StoredChatMessage[]> {
  try {
    const msgs = await db.messages
      .where('[peerId+timestamp]')
      .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
      .and((msg) => msg.isDeleted !== true && (msg.type === 'file' || !!msg.file))
      .toArray();

    return msgs.reverse();
  } catch (err) {
    log.db.error(`Lỗi lấy danh sách file cho peer ${peerId}:`, err);
    throw new DatabaseError(`Không thể lấy danh sách file cho peer: ${peerId}`, err);
  }
}

/**
 * Mở rộng: Lấy các tin nhắn đã ghim
 */
export async function getPinnedMessages(peerId: string): Promise<StoredChatMessage[]> {
  try {
    const msgs = await db.messages
      .where('[peerId+timestamp]')
      .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
      .and((msg) => msg.isDeleted !== true && Boolean(msg.isPinned))
      .toArray();

    return msgs; // Keep chronological order for pinned messages
  } catch (err) {
    log.db.error(`Lỗi lấy danh sách tin nhắn ghim cho peer ${peerId}:`, err);
    throw new DatabaseError(`Không thể lấy danh sách tin nhắn ghim cho peer: ${peerId}`, err);
  }
}

// --- Contacts ---

/**
 * Thêm một người vào danh bạ.
 */
export async function addContact(peerId: string, name: string, color: string): Promise<void> {
  try {
    await db.contacts.put({ peerId, name, color, addedAt: Date.now() });
  } catch (err) {
    log.db.error('Lỗi thêm danh bạ:', err);
    throw new DatabaseError(`Không thể thêm danh bạ: ${peerId}`, err);
  }
}

/**
 * Xóa một người khỏi danh bạ.
 */
export async function removeContact(peerId: string): Promise<void> {
  try {
    await db.contacts.delete(peerId);
  } catch (err) {
    log.db.error('Lỗi xóa danh bạ:', err);
    throw new DatabaseError(`Không thể xóa danh bạ: ${peerId}`, err);
  }
}

/**
 * Lấy toàn bộ danh sách danh bạ, sắp xếp theo thời gian thêm.
 */
export async function getAllContacts(): Promise<ContactRecord[]> {
  try {
    return await db.contacts.orderBy('addedAt').toArray();
  } catch (err) {
    log.db.error('Lỗi tải danh bạ:', err);
    throw new DatabaseError('Không thể tải danh bạ', err);
  }
}

/**
 * Kiểm tra nhanh xem một peer có trong danh bạ không.
 */
export async function isInContacts(peerId: string): Promise<boolean> {
  try {
    const record = await db.contacts.get(peerId);
    return record !== undefined;
  } catch (err) {
    log.db.error('Lỗi kiểm tra danh bạ:', err);
    throw new DatabaseError(`Không thể kiểm tra danh bạ: ${peerId}`, err);
  }
}

/**
 * Xóa toàn bộ tin nhắn và file đính kèm trong cơ sở dữ liệu.
 */
export async function clearAllMessagesFromDB(): Promise<void> {
  try {
    // Clear in a transaction for safety
    await db.transaction('rw', [db.messages, db.files, db.transactional_outbox], async () => {
      await db.messages.clear();
      await db.files.clear();
      await db.transactional_outbox.clear();
    });
  } catch (err) {
    log.db.error('Lỗi xóa sạch tin nhắn:', err);
    throw new DatabaseError('Không thể xóa sạch tin nhắn', err);
  }
}
