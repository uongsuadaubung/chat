import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { atomicActionManager } from './atomicActionManager';
import { db } from '$lib/core/db';
import * as channelUtil from '$lib/features/webrtc/dataChannels/channel.util';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import type { TransactionalOutboxRecord } from './transaction.type';
import type { ChatMessage } from '$lib/type';

vi.mock('$lib/features/webrtc/dataChannels/channel.util', () => ({
  sendToPeer: vi.fn().mockResolvedValue(undefined)
}));

describe('Atomic Transactions Retry Mechanism', () => {
  beforeEach(async () => {
    await db.transactional_outbox.clear();
    await db.messages.clear();
    vi.clearAllMocks();

    // Mock context
    ctx.messages = {};
    ctx.currentUser = { id: 'user1', name: 'Me' };
  });

  it('should process all pending/failed/rolled_back transactions for a peer', async () => {
    const peerId = 'peer1';

    // 1. Setup outbox with various states
    await db.transactional_outbox.add({
      peerId,
      actionType: 'pin',
      payload: { type: 'message_pin', messageId: 'm1', isPinned: true, peerId },
      status: 'pending',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      retries: 0,
      maxRetries: 3
    } as TransactionalOutboxRecord);

    await db.transactional_outbox.add({
      peerId,
      actionType: 'edit',
      payload: { type: 'message_edit', messageId: 'm2', newText: 'Edited', peerId },
      status: 'rolled_back',
      createdAt: Date.now() - 500,
      updatedAt: Date.now() - 500,
      retries: 1,
      maxRetries: 3,
      fullAction: { type: 'edit', messageId: 'm2', peerId: peerId, newText: 'Edited' },
      originalState: { text: 'Original' }
    } as TransactionalOutboxRecord);

    // This one is already completed, should be skipped
    await db.transactional_outbox.add({
      peerId,
      actionType: 'react',
      payload: { type: 'message_react', messageId: 'm3', reaction: '👍', peerId },
      status: 'completed',
      createdAt: Date.now() - 100,
      updatedAt: Date.now() - 100,
      retries: 0,
      maxRetries: 3
    } as TransactionalOutboxRecord);

    // Mock DB action for edit
    ctx.messages[peerId] = [
      {
        id: 'm2',
        text: 'Original',
        senderId: 'user1',
        senderName: 'Me',
        peerId,
        timestamp: Date.now(),
        isSelf: true
      } as ChatMessage
    ];

    // 2. Execute processOutboxForPeer
    await atomicActionManager.processOutboxForPeer(peerId);

    // 3. Verify
    expect(channelUtil.sendToPeer).toHaveBeenCalledTimes(2);

    const records = await db.transactional_outbox.where('peerId').equals(peerId).toArray();
    const pending = records.find((r) => r.actionType === 'pin');
    const rolledBack = records.find((r) => r.actionType === 'edit');
    const completed = records.find((r) => r.actionType === 'react');

    expect(pending?.status).toBe('completed');
    expect(rolledBack?.status).toBe('completed');
    expect(completed?.status).toBe('completed'); // Stayed completed

    // Verify UI update for rolled_back task
    expect(ctx.messages[peerId][0].text).toBe('Edited');
  });

  it('should increment retries and set status to failed on retry failure', async () => {
    const peerId = 'peer2';
    vi.mocked(channelUtil.sendToPeer).mockRejectedValueOnce(new Error('Still down'));

    const id = await db.transactional_outbox.add({
      peerId,
      actionType: 'chat',
      payload: {
        type: 'chat',
        message: { id: 'm4', peerId, senderId: 'u', senderName: 'U', timestamp: 1, isSelf: true },
        peerId
      },
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retries: 0,
      maxRetries: 3
    } as TransactionalOutboxRecord);

    await atomicActionManager.retryTransaction(id);

    const record = await db.transactional_outbox.get(id);
    expect(record?.status).toBe('failed');
    expect(record?.retries).toBe(1);
    expect(record?.error).toContain('Still down');
  });
});
