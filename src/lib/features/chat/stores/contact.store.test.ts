/**
 * Test cho ContactsStore — kiểm tra behavior của store (reactive state + DB interaction).
 * Dùng fake-indexeddb để test tích hợp thực sự với IndexedDB mà không cần browser.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '$lib/core/db';
import type { PeerUser } from '$lib/type';

// Import class trực tiếp để tạo instance mới cho mỗi test (tránh shared singleton)
import { ContactsStore } from './contact.store.svelte';

const makePeer = (overrides: Partial<PeerUser> = {}): PeerUser => ({
  id: 'peer-1',
  name: 'Alice',
  color: '#7c3aed',
  connected: true,
  hasFailed: false,
  ...overrides
});

describe('ContactsStore', () => {
  let store: ContactsStore;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    store = new ContactsStore();
  });

  afterEach(async () => {
    await db.delete();
  });

  // --- load() ---

  it('load: danh sách contacts rỗng khi chưa có dữ liệu', async () => {
    await store.load();

    expect(store.contacts).toHaveLength(0);
    expect(store.isLoaded).toBe(true);
  });

  it('load: nạp đúng contacts đã có trong DB', async () => {
    // Thêm thẳng vào DB trước khi load store
    const { addContact } = await import('$lib/core/db');
    await addContact('peer-1', 'Alice', '#aaa');
    await addContact('peer-2', 'Bob', '#bbb');

    await store.load();

    expect(store.contacts).toHaveLength(2);
    expect(store.contacts[0].peerId).toBe('peer-1');
    expect(store.contacts[1].peerId).toBe('peer-2');
  });

  it('load: chỉ load 1 lần kể cả gọi nhiều lần', async () => {
    const { addContact } = await import('$lib/core/db');
    await addContact('peer-1', 'Alice', '#aaa');

    await store.load();
    // Thêm contact mới sau lần load đầu
    await addContact('peer-2', 'Bob', '#bbb');
    // Gọi load() lần 2 — phải bị skip vì isLoaded = true
    await store.load();

    // Phải vẫn là 1, không reload từ DB lần nữa
    expect(store.contacts).toHaveLength(1);
  });

  // --- add() ---

  it('add: thêm contact mới vào state và DB', async () => {
    await store.load();
    const peer = makePeer();

    await store.add(peer);

    expect(store.contacts).toHaveLength(1);
    expect(store.contacts[0].peerId).toBe('peer-1');
    expect(store.contacts[0].name).toBe('Alice');
    expect(store.isContact('peer-1')).toBe(true);
  });

  it('add: gọi lại với cùng peer thì cập nhật tên thay vì thêm bản sao', async () => {
    await store.load();
    const peer = makePeer();

    await store.add(peer);
    await store.add({ ...peer, name: 'Alice V2' });

    expect(store.contacts).toHaveLength(1);
    expect(store.contacts[0].name).toBe('Alice V2');
  });

  it('add: thêm nhiều peer khác nhau, state phản ánh đủ', async () => {
    await store.load();

    await store.add(makePeer({ id: 'peer-1', name: 'Alice' }));
    await store.add(makePeer({ id: 'peer-2', name: 'Bob' }));
    await store.add(makePeer({ id: 'peer-3', name: 'Charlie' }));

    expect(store.contacts).toHaveLength(3);
    expect(store.isContact('peer-1')).toBe(true);
    expect(store.isContact('peer-2')).toBe(true);
    expect(store.isContact('peer-3')).toBe(true);
  });

  // --- remove() ---

  it('remove: xóa contact khỏi state và DB', async () => {
    await store.load();
    await store.add(makePeer({ id: 'peer-1' }));
    await store.add(makePeer({ id: 'peer-2', name: 'Bob' }));

    await store.remove('peer-1');

    expect(store.contacts).toHaveLength(1);
    expect(store.contacts[0].peerId).toBe('peer-2');
    expect(store.isContact('peer-1')).toBe(false);
  });

  it('remove: xóa peerId không tồn tại không throw lỗi', async () => {
    await store.load();

    await expect(store.remove('non-existent')).resolves.toBeUndefined();
    expect(store.contacts).toHaveLength(0);
  });

  // --- isContact() ---

  it('isContact: trả về false khi store chưa load', () => {
    expect(store.isContact('peer-1')).toBe(false);
  });

  it('isContact: trả về false khi peer không có trong danh bạ', async () => {
    await store.load();

    expect(store.isContact('peer-unknown')).toBe(false);
  });

  it('isContact: trả về true sau khi add, false sau khi remove', async () => {
    await store.load();
    const peer = makePeer();

    await store.add(peer);
    expect(store.isContact('peer-1')).toBe(true);

    await store.remove('peer-1');
    expect(store.isContact('peer-1')).toBe(false);
  });

  // --- contactIds getter ---

  it('contactIds: trả về Set rỗng khi không có contacts', async () => {
    await store.load();

    expect(store.contactIds.size).toBe(0);
  });

  it('contactIds: chứa đúng các peerId đã thêm', async () => {
    await store.load();
    await store.add(makePeer({ id: 'peer-1' }));
    await store.add(makePeer({ id: 'peer-2', name: 'Bob' }));

    expect(store.contactIds.has('peer-1')).toBe(true);
    expect(store.contactIds.has('peer-2')).toBe(true);
    expect(store.contactIds.size).toBe(2);
  });
});
