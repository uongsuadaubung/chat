import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, saveMessageToDB, loadMessagesForPeerFromDB } from './db';
import type { ChatMessage } from '$lib/features/chat/types/chat.type';

describe('P2PChatDatabase V2 Migration', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('should save and load message using peerId directly from ChatMessage', async () => {
    const msg: ChatMessage = {
      id: 'msg-v2',
      senderId: 'me',
      senderName: 'Me',
      peerId: 'peer-V2', // Standardized peerId
      isSelf: true,
      timestamp: Date.now(),
      text: 'Hello V2'
    };

    // This should work with the updated saveMessageToDB
    await saveMessageToDB(msg);

    const msgs = await loadMessagesForPeerFromDB('peer-V2');
    expect(msgs.length).toBe(1);
    expect(msgs[0].id).toBe('msg-v2');
    expect(msgs[0].peerId).toBe('peer-V2');
  });

  it('should have database version 2', () => {
    expect(db.verno).toBe(2);
  });
});
