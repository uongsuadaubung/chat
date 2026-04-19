import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  db,
  saveMessageToDB,
  loadMessagesForPeerFromDB,
  saveFileBlobToDB,
  getFileBlobFromDB,
  deleteFileBlobFromDB,
  addContact,
  removeContact,
  getAllContacts,
  isInContacts
} from './db';
import type { ChatMessage, DataChannelPayload } from '$lib/features/chat/types/chat.type';

describe('P2PChatDatabase', () => {
  beforeEach(async () => {
    // Xóa database trước mỗi test
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('lưu và truy xuất tin nhắn theo peerId thành công', async () => {
    const msg1: ChatMessage = {
      id: 'msg-1',
      senderId: 'me',
      senderName: 'Me',
      peerId: 'peer-A',
      isSelf: true,
      timestamp: 1000,
      text: 'Hello A'
    };

    const msg2: ChatMessage = {
      id: 'msg-2',
      senderId: 'peer-B',
      senderName: 'B',
      peerId: 'peer-B',
      isSelf: false,
      timestamp: 2000,
      text: 'Hello Me'
    };

    const msg3: ChatMessage = {
      id: 'msg-3',
      senderId: 'me',
      senderName: 'Me',
      peerId: 'peer-A',
      isSelf: true,
      timestamp: 3000,
      text: 'How are you A'
    };

    await saveMessageToDB(msg1);
    await saveMessageToDB(msg2);
    await saveMessageToDB(msg3);

    const msgsA = await loadMessagesForPeerFromDB('peer-A');
    expect(msgsA.length).toBe(2);
    expect(msgsA[0].id).toBe('msg-1');
    expect(msgsA[1].id).toBe('msg-3');

    const msgsB = await loadMessagesForPeerFromDB('peer-B');
    expect(msgsB.length).toBe(1);
    expect(msgsB[0].id).toBe('msg-2');
  });

  it('lưu và truy xuất file Blob thành công', async () => {
    const fileId = 'file-123';
    const blob = new Blob(['hello world'], { type: 'text/plain' });

    await saveFileBlobToDB(fileId, blob);

    const retrievedBlob = await getFileBlobFromDB(fileId);
    expect(retrievedBlob).toBeDefined();

    const text = await retrievedBlob?.text();
    expect(text).toBe('hello world');
  });

  it('trả về undefined nếu file blob không tồn tại', async () => {
    const retrievedBlob = await getFileBlobFromDB('non-existent');
    expect(retrievedBlob).toBeUndefined();
  });

  it('xóa file Blob thành công', async () => {
    const fileId = 'file-to-delete';
    const blob = new Blob(['to be deleted'], { type: 'text/plain' });

    await saveFileBlobToDB(fileId, blob);
    let retrievedBlob = await getFileBlobFromDB(fileId);
    expect(retrievedBlob).toBeDefined();

    await deleteFileBlobFromDB(fileId);

    retrievedBlob = await getFileBlobFromDB(fileId);
    expect(retrievedBlob).toBeUndefined();
  });

  it('lưu, truy xuất và xóa transactional_outbox thành công', async () => {
    const peerId = 'peer-outbox';
    const payload1: DataChannelPayload = {
      type: 'chat',
      message: { id: '1', senderId: 'me', senderName: 'Me', peerId, timestamp: 1, isSelf: true },
      peerId
    };

    // Add to transactional_outbox
    await db.transactional_outbox.add({
      peerId,
      actionType: 'chat',
      payload: payload1,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retries: 0,
      maxRetries: 3
    });

    const payload2: DataChannelPayload = {
      type: 'chat',
      message: { id: '2', senderId: 'me', senderName: 'Me', peerId, timestamp: 2, isSelf: true },
      peerId
    };
    await db.transactional_outbox.add({
      peerId,
      actionType: 'chat',
      payload: payload2,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retries: 0,
      maxRetries: 3
    });

    const outboxRecords = await db.transactional_outbox.where('peerId').equals(peerId).toArray();
    expect(outboxRecords.length).toBe(2);
    expect(outboxRecords[0].payload).toEqual(payload1);
    expect(outboxRecords[1].payload).toEqual(payload2);

    const firstId = outboxRecords[0].id;
    expect(firstId).toBeDefined();

    if (firstId !== undefined) {
      // Xóa record đầu tiên
      await db.transactional_outbox.delete(firstId);

      const remainingRecords = await db.transactional_outbox
        .where('peerId')
        .equals(peerId)
        .toArray();
      expect(remainingRecords.length).toBe(1);
      expect(remainingRecords[0].id).toBe(outboxRecords[1].id);
      expect(remainingRecords[0].payload).toEqual(payload2);
    }
  });
});

describe('Contacts (danh bạ)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('addContact: thêm một contact mới và getAllContacts trả về đúng', async () => {
    await addContact('peer-1', 'Alice', '#ff0000');

    const contacts = await getAllContacts();

    expect(contacts).toHaveLength(1);
    expect(contacts[0].peerId).toBe('peer-1');
    expect(contacts[0].name).toBe('Alice');
    expect(contacts[0].color).toBe('#ff0000');
    expect(contacts[0].addedAt).toBeGreaterThan(0);
  });

  it('addContact: gọi lại với cùng peerId thì ghi đè (upsert) chứ không tạo bản ghi mới', async () => {
    await addContact('peer-1', 'Alice', '#ff0000');
    await addContact('peer-1', 'Alice Renamed', '#00ff00');

    const contacts = await getAllContacts();

    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe('Alice Renamed');
    expect(contacts[0].color).toBe('#00ff00');
  });

  it('getAllContacts: trả về mảng rỗng khi chưa có contact nào', async () => {
    const contacts = await getAllContacts();

    expect(contacts).toHaveLength(0);
  });

  it('getAllContacts: sắp xếp theo addedAt tăng dần', async () => {
    await addContact('peer-1', 'Alice', '#aaa');
    // Đợi 1ms để timestamp khác nhau
    await new Promise((r) => setTimeout(r, 2));
    await addContact('peer-2', 'Bob', '#bbb');
    await new Promise((r) => setTimeout(r, 2));
    await addContact('peer-3', 'Charlie', '#ccc');

    const contacts = await getAllContacts();

    expect(contacts.map((c) => c.peerId)).toEqual(['peer-1', 'peer-2', 'peer-3']);
  });

  it('removeContact: xóa đúng contact theo peerId', async () => {
    await addContact('peer-1', 'Alice', '#aaa');
    await addContact('peer-2', 'Bob', '#bbb');

    await removeContact('peer-1');

    const contacts = await getAllContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].peerId).toBe('peer-2');
  });

  it('removeContact: không báo lỗi khi xóa peerId không tồn tại', async () => {
    // Dự kiến: không throw, list vẫn rỗng
    await expect(removeContact('non-existent')).resolves.toBeUndefined();

    const contacts = await getAllContacts();
    expect(contacts).toHaveLength(0);
  });

  it('isInContacts: trả về true nếu peer đã được thêm', async () => {
    await addContact('peer-1', 'Alice', '#aaa');

    const result = await isInContacts('peer-1');

    expect(result).toBe(true);
  });

  it('isInContacts: trả về false nếu peer chưa được thêm', async () => {
    const result = await isInContacts('peer-unknown');

    expect(result).toBe(false);
  });

  it('isInContacts: trả về false sau khi xóa contact', async () => {
    await addContact('peer-1', 'Alice', '#aaa');
    await removeContact('peer-1');

    const result = await isInContacts('peer-1');

    expect(result).toBe(false);
  });
});
