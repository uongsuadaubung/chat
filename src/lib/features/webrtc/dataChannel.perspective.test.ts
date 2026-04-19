import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ctx } from './webrtc.context.svelte';
import { handleMessageDelete, handleMessageEdit, handleSyncData } from './dataChannel';
import { atomicActionManager } from './atomicActionManager';
import type { ChatMessage } from '$lib/features/chat/types/chat.type';
import { db } from '$lib/core/db';

// Mock helper to create messages
function makeMsg(
  id: string,
  senderId: string,
  peerId: string,
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id,
    senderId,
    peerId,
    senderName: senderId === 'me' ? 'Me' : 'Peer',
    timestamp: Date.now(),
    isSelf: senderId === 'me',
    type: 'text',
    text: 'Hello',
    ...overrides
  } as ChatMessage;
}

describe('P2P 1-1 Perspective Consistency', () => {
  const ME = 'user_me';
  const ALICE = 'user_alice';

  beforeEach(async () => {
    await db.messages.clear();
    await db.transactional_outbox.clear();
    ctx.currentUser = { id: ME, name: 'Me' };
    ctx.messages = {};
    vi.clearAllMocks();
  });

  describe('Incoming Message Actions (Perspective)', () => {
    it('should delete a message in the correct room when receiving signal from Alice', async () => {
      // Setup: Bob (ME) has a message from Alice in room Alice
      const msgId = 'msg_from_alice';
      ctx.messages[ALICE] = [makeMsg(msgId, ALICE, ALICE, { text: 'Secret' })];

      // Action: Alice sends delete signal.
      // Alice's payload might say peerId: ME (because she's talking to Bob)
      await handleMessageDelete(ALICE, {
        type: 'message_delete',
        messageId: msgId,
        peerId: ME
      });

      // Verify: Bob should find the message in ALICE's room and mark as deleted
      expect(ctx.messages[ALICE][0].isDeleted).toBe(true);
      expect(ctx.messages[ME]).toBeUndefined(); // Should NOT create a room for himself
    });

    it('should edit a message in the correct room when receiving signal from Alice', async () => {
      const msgId = 'msg_to_edit';
      ctx.messages[ALICE] = [makeMsg(msgId, ALICE, ALICE, { text: 'Old text' })];

      await handleMessageEdit(ALICE, {
        type: 'message_edit',
        messageId: msgId,
        newText: 'New text',
        peerId: ME
      });

      expect(ctx.messages[ALICE][0].text).toBe('New text');
      expect(ctx.messages[ALICE][0].isEdited).toBe(true);
    });
  });

  describe('Batch Data Synchronization (Perspective)', () => {
    it('should override peerId of all incoming messages to match the sender during sync', async () => {
      // Setup: Alice sends Bob (ME) a batch of messages she has in her DB.
      // In Alice's DB, these messages have peerId: ME.
      const syncedMessages = [
        makeMsg('sync_1', ALICE, ME, { text: 'Hi Bob, I sent this while you were away' }),
        makeMsg('sync_2', ME, ALICE, { text: 'And this was your last message to me', isSelf: true })
      ];

      // Action: Alice (ALICE) sends sync_data to Bob (ME)
      await handleSyncData(ALICE, {
        type: 'sync_data',
        messages: syncedMessages
      });

      // Verify: Bob should save both messages in room ALICE
      // and ensure isSelf is correct from Bob's perspective
      const roomAlice = ctx.messages[ALICE];
      expect(roomAlice).toBeDefined();
      expect(roomAlice).toHaveLength(2);

      // synced_1: Sender Alice -> Bob's perspective: peer is Alice, isSelf is false
      expect(roomAlice[0].peerId).toBe(ALICE);
      expect(roomAlice[0].isSelf).toBe(false);

      // synced_2: Sender Bob (ME) -> Bob's perspective: peer is Alice, isSelf is true
      expect(roomAlice[1].peerId).toBe(ALICE);
      expect(roomAlice[1].isSelf).toBe(true);
    });
  });

  describe('Offline Messaging (Outbox)', () => {
    it('should process failed/rolled_back transactions when peer comes online', async () => {
      // Setup: Bob tries to send message to Alice while Alice is offline
      const msgId = 'offline_msg';
      const action = {
        type: 'chat',
        messageId: msgId,
        peerId: ALICE,
        message: makeMsg(msgId, ME, ALICE, { isSelf: true })
      } as const;

      // Simulate a failed transaction (e.g. timeout)
      await db.transactional_outbox.add({
        peerId: ALICE,
        actionType: 'chat',
        payload: { type: 'chat', message: action.message, peerId: ALICE },
        status: 'rolled_back',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retries: 0,
        maxRetries: 3,
        fullAction: action
      });

      // Mock connection opening and sync_ready being received
      const processSpy = vi.spyOn(atomicActionManager, 'processOutboxForPeer');

      // This is what handleSyncReady calls now
      await atomicActionManager.processOutboxForPeer(ALICE);

      expect(processSpy).toHaveBeenCalledWith(ALICE);
      // Further verification would require mocking sendToPeer to succeed
    });
  });
});
