import { addContact, removeContact, getAllContacts, type ContactRecord } from '$lib/core/db';
import { log } from '$lib/core/logger';
import { DatabaseError } from '$lib/core/db';
import type { PeerUser } from '$lib/type';
import { SvelteSet } from 'svelte/reactivity';

export class ContactsStore {
  contacts = $state<ContactRecord[]>([]);
  isLoaded = $state(false);

  /** Set peerId để check O(1) */
  get contactIds(): SvelteSet<string> {
    return new SvelteSet(this.contacts.map((c) => c.peerId));
  }

  isContact(peerId: string): boolean {
    return this.contactIds.has(peerId);
  }

  async load(): Promise<void> {
    if (this.isLoaded) return;
    try {
      this.contacts = await getAllContacts();
      this.isLoaded = true;
    } catch (err: unknown) {
      if (err instanceof DatabaseError) throw err;
      log.db.error('Lỗi tải danh bạ:', err);
      throw new DatabaseError('Không thể tải danh bạ khi khởi động', err);
    }
  }

  async add(peer: PeerUser): Promise<void> {
    try {
      await addContact(peer.id, peer.name, peer.color);
      // Update reactive state — replace if exists, else append
      const idx = this.contacts.findIndex((c) => c.peerId === peer.id);
      const record: ContactRecord = {
        peerId: peer.id,
        name: peer.name,
        color: peer.color,
        addedAt: Date.now()
      };
      if (idx !== -1) {
        this.contacts = [...this.contacts.slice(0, idx), record, ...this.contacts.slice(idx + 1)];
      } else {
        this.contacts = [...this.contacts, record];
      }
    } catch (err: unknown) {
      if (err instanceof DatabaseError) throw err;
      log.db.error('Lỗi thêm danh bạ:', err);
      throw new DatabaseError(`Không thể thêm danh bạ: ${peer.id}`, err);
    }
  }

  async remove(peerId: string): Promise<void> {
    try {
      await removeContact(peerId);
      this.contacts = this.contacts.filter((c) => c.peerId !== peerId);
    } catch (err: unknown) {
      if (err instanceof DatabaseError) throw err;
      log.db.error('Lỗi xóa danh bạ:', err);
      throw new DatabaseError(`Không thể xóa danh bạ: ${peerId}`, err);
    }
  }
}

export const contactsStore = new ContactsStore();
