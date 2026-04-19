// tests/atomicActionManager.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AtomicActionManager } from '$lib/features/webrtc/atomicActionManager';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';

vi.mock('$lib/features/webrtc/dataChannels/channel.util', () => ({
  sendToPeer: vi.fn()
}));

const { mockOutboxAdd, mockOutboxUpdate, mockOutboxWhere } = vi.hoisted(() => ({
  mockOutboxAdd: vi.fn().mockResolvedValue(1),
  mockOutboxUpdate: vi.fn().mockResolvedValue(undefined),
  mockOutboxWhere: vi.fn()
}));

vi.mock('$lib/core/db', () => ({
  db: {
    transactional_outbox: {
      add: mockOutboxAdd,
      update: mockOutboxUpdate,
      where: mockOutboxWhere
    }
  },
  saveMessageToDB: vi.fn().mockResolvedValue(undefined)
}));

const BASE_MSG = {
  id: 'msg_123',
  senderId: 'peer_1',
  senderName: 'Peer',
  peerId: 'peer_1',
  timestamp: 1000,
  isSelf: false
} as const;

describe('AtomicActionManager', () => {
  let manager: AtomicActionManager;

  beforeEach(() => {
    manager = new AtomicActionManager();
    ctx.messages = {
      peer_1: [
        {
          ...BASE_MSG,
          text: 'Hello',
          isPinned: false,
          reactions: {},
          isDeleted: false
        }
      ]
    };
    ctx.currentUser = { id: 'me_123', name: 'Me' };
    mockOutboxAdd.mockClear();
    mockOutboxUpdate.mockClear();
  });

  // ───────────── pin ─────────────
  it('should execute successful pin transaction', async () => {
    const action = { type: 'pin' as const, messageId: 'msg_123', peerId: 'peer_1', isPinned: true };
    let uiUpdated = false;

    const result = await manager.executeAtomicAction(action, () => {
      uiUpdated = true;
    });

    expect(result.success).toBe(true);
    expect(uiUpdated).toBe(true);
    expect(mockOutboxAdd).toHaveBeenCalledOnce();
    expect(mockOutboxUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'completed' })
    );
  });

  // ───────────── edit ─────────────
  it('should execute successful edit transaction', async () => {
    const action = {
      type: 'edit' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      newText: 'Updated text'
    };

    const result = await manager.executeAtomicAction(action, () => {});

    expect(result.success).toBe(true);
    expect(mockOutboxAdd).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'edit' }));
  });

  it('should build correct edit network payload', async () => {
    const { sendToPeer } = await import('$lib/features/webrtc/dataChannels/channel.util');

    const action = {
      type: 'edit' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      newText: 'New text'
    };

    await manager.executeAtomicAction(action, () => {});

    expect(sendToPeer).toHaveBeenCalledWith(
      'peer_1',
      expect.objectContaining({ type: 'message_edit', newText: 'New text', messageId: 'msg_123' }),
      { skipOutbox: true }
    );
  });

  it('should rollback edit on DB failure', async () => {
    const { saveMessageToDB } = await import('$lib/core/db');
    (saveMessageToDB as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));

    const action = {
      type: 'edit' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      newText: 'Changed'
    };

    // Capture original text
    const originalText = ctx.messages['peer_1']![0]!.text;

    const result = await manager.executeAtomicAction(action, () => {
      // In real code the optimistic update changes the text
      ctx.messages = {
        peer_1: [{ ...ctx.messages['peer_1']![0]!, text: 'Changed' }]
      };
    });

    expect(result.success).toBe(false);
    // Rollback should restore original text
    expect(ctx.messages['peer_1']![0]!.text).toBe(originalText);
  });

  // ───────────── delete (syncGlobal=true) ─────────────
  it('should execute successful delete (syncGlobal) transaction', async () => {
    const action = {
      type: 'delete' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      syncGlobal: true
    };

    const result = await manager.executeAtomicAction(action, () => {});

    expect(result.success).toBe(true);
    expect(mockOutboxAdd).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'delete' }));
  });

  it('should build message_delete payload for syncGlobal=true', async () => {
    const { sendToPeer } = await import('$lib/features/webrtc/dataChannels/channel.util');

    const action = {
      type: 'delete' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      syncGlobal: true
    };

    await manager.executeAtomicAction(action, () => {});

    expect(sendToPeer).toHaveBeenCalledWith(
      'peer_1',
      expect.objectContaining({ type: 'message_delete', messageId: 'msg_123' }),
      { skipOutbox: true }
    );
  });

  it('should build message_hide_local payload for syncGlobal=false', async () => {
    const { sendToPeer } = await import('$lib/features/webrtc/dataChannels/channel.util');

    const action = {
      type: 'delete' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      syncGlobal: false
    };

    await manager.executeAtomicAction(action, () => {});

    expect(sendToPeer).toHaveBeenCalledWith(
      'peer_1',
      expect.objectContaining({ type: 'message_hide_local', messageId: 'msg_123' }),
      { skipOutbox: true }
    );
  });

  it('should rollback delete on DB failure — restore original message', async () => {
    const { saveMessageToDB } = await import('$lib/core/db');
    (saveMessageToDB as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB fail'));

    const originalMsg = { ...ctx.messages['peer_1']![0]! };

    const action = {
      type: 'delete' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      syncGlobal: true
    };

    await manager.executeAtomicAction(action, () => {
      // Optimistic: mark deleted
      ctx.messages = {
        peer_1: [{ ...ctx.messages['peer_1']![0]!, isDeleted: true, text: undefined }]
      };
    });

    // Rollback should restore the original message
    expect(ctx.messages['peer_1']![0]!.isDeleted).toBe(originalMsg.isDeleted);
    expect(ctx.messages['peer_1']![0]!.text).toBe(originalMsg.text);
  });

  // ───────────── react ─────────────
  it('should execute successful react transaction', async () => {
    const action = {
      type: 'react' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      reaction: '❤️'
    };

    const result = await manager.executeAtomicAction(action, () => {});

    expect(result.success).toBe(true);
  });

  it('should build correct react network payload', async () => {
    const { sendToPeer } = await import('$lib/features/webrtc/dataChannels/channel.util');

    const action = {
      type: 'react' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      reaction: '👍'
    };

    await manager.executeAtomicAction(action, () => {});

    expect(sendToPeer).toHaveBeenCalledWith(
      'peer_1',
      expect.objectContaining({ type: 'message_react', reaction: '👍', messageId: 'msg_123' }),
      { skipOutbox: true }
    );
  });

  it('should toggle reaction off when same reaction sent again', async () => {
    // Pre-set existing reaction
    ctx.messages = {
      peer_1: [
        {
          ...BASE_MSG,
          text: 'Hello',
          reactions: { me_123: '❤️' }
        }
      ]
    };

    const { saveMessageToDB } = await import('$lib/core/db');
    const saveSpy = vi.mocked(saveMessageToDB);
    saveSpy.mockClear();

    const action = {
      type: 'react' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      reaction: '❤️' // same → toggle off
    };

    const result = await manager.executeAtomicAction(action, () => {});
    expect(result.success).toBe(true);

    // executeDBAction saves the toggled-off message to DB — verify reaction was removed
    const savedMsg = saveSpy.mock.calls[0]?.[0];
    expect(savedMsg?.reactions?.['me_123']).toBeUndefined();
  });

  it('should rollback react on DB failure — restore original reactions', async () => {
    const { saveMessageToDB } = await import('$lib/core/db');
    (saveMessageToDB as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB fail'));

    ctx.messages = {
      peer_1: [{ ...BASE_MSG, text: 'Hello', reactions: { me_123: '👍' } }]
    };

    const action = {
      type: 'react' as const,
      messageId: 'msg_123',
      peerId: 'peer_1',
      reaction: '❤️'
    };

    await manager.executeAtomicAction(action, () => {
      // Optimistic: set new reaction
      ctx.messages = {
        peer_1: [{ ...ctx.messages['peer_1']![0]!, reactions: { me_123: '❤️' } }]
      };
    });

    // Rollback should restore '👍'
    expect(ctx.messages['peer_1']![0]!.reactions?.['me_123']).toBe('👍');
  });

  // ───────────── message not found ─────────────
  it('should return failure when message not found', async () => {
    const action = {
      type: 'edit' as const,
      messageId: 'nonexistent_id',
      peerId: 'peer_1',
      newText: 'whatever'
    };

    const result = await manager.executeAtomicAction(action, () => {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot capture state');
  });

  // ───────────── cleanupOldTransactions ─────────────
  it('cleanupOldTransactions should call bulkDelete for old completed records', async () => {
    const mockBulkDelete = vi.fn().mockResolvedValue(undefined);
    const oldDate = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago

    mockOutboxWhere.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        and: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { id: 1, status: 'completed', updatedAt: oldDate },
            { id: 2, status: 'completed', updatedAt: oldDate }
          ])
        })
      })
    });

    const { db } = await import('$lib/core/db');
    (db.transactional_outbox as unknown as { bulkDelete: typeof mockBulkDelete }).bulkDelete =
      mockBulkDelete;

    await manager.cleanupOldTransactions();

    expect(mockBulkDelete).toHaveBeenCalledWith([1, 2]);
  });

  it('cleanupOldTransactions should skip when no old records', async () => {
    const mockBulkDelete = vi.fn().mockResolvedValue(undefined);

    mockOutboxWhere.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        and: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]) // nothing to delete
        })
      })
    });

    const { db } = await import('$lib/core/db');
    (db.transactional_outbox as unknown as { bulkDelete: typeof mockBulkDelete }).bulkDelete =
      mockBulkDelete;

    await manager.cleanupOldTransactions();

    expect(mockBulkDelete).not.toHaveBeenCalled();
  });

  // ───────────── chat transaction ─────────────
  it('should execute successful chat transaction', async () => {
    const action = {
      type: 'chat' as const,
      messageId: 'msg_new_123',
      peerId: 'peer_1',
      message: {
        id: 'msg_new_123',
        senderId: 'me_123',
        senderName: 'Me',
        peerId: 'peer_1',
        text: 'Hello peer',
        timestamp: Date.now(),
        isSelf: true,
        type: 'text' as const
      }
    };

    const result = await manager.executeAtomicAction(action);

    expect(result.success).toBe(true);
    expect(mockOutboxAdd).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'chat' }));
  });

  it('should build correct chat network payload', async () => {
    const { sendToPeer } = await import('$lib/features/webrtc/dataChannels/channel.util');

    const action = {
      type: 'chat' as const,
      messageId: 'msg_new_123',
      peerId: 'peer_1',
      message: {
        id: 'msg_new_123',
        senderId: 'me_123',
        senderName: 'Me',
        peerId: 'peer_1',
        text: 'Hello',
        timestamp: Date.now(),
        isSelf: true,
        type: 'text' as const
      }
    };

    await manager.executeAtomicAction(action);

    expect(sendToPeer).toHaveBeenCalledWith(
      'peer_1',
      expect.objectContaining({
        type: 'chat',
        message: expect.objectContaining({ text: 'Hello' }),
        peerId: 'peer_1'
      }),
      { skipOutbox: true }
    );
  });

  it('should build correct chat network payload', async () => {
    const { sendToPeer } = await import('$lib/features/webrtc/dataChannels/channel.util');

    const action = {
      type: 'chat' as const,
      messageId: 'msg_new_123',
      peerId: 'peer_1',
      message: {
        id: 'msg_new_123',
        senderId: 'me_123',
        senderName: 'Me',
        peerId: 'peer_1',
        text: 'Hello',
        timestamp: Date.now(),
        isSelf: true
      }
    };

    await manager.executeAtomicAction(action);

    expect(sendToPeer).toHaveBeenCalledWith(
      'peer_1',
      expect.objectContaining({
        type: 'chat',
        message: expect.objectContaining({ text: 'Hello' }),
        peerId: 'peer_1'
      }),
      { skipOutbox: true }
    );
  });

  // ───────────── file transaction ─────────────
  it('should execute successful file transaction', async () => {
    const action = {
      type: 'file' as const,
      messageId: 'file_123',
      peerId: 'peer_1',
      fileId: 'file_123',
      meta: {
        id: 'file_123',
        senderId: 'me_123',
        name: 'test.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        totalChunks: 1,
        timestamp: Date.now()
      }
    };

    const result = await manager.executeAtomicAction(action);

    expect(result.success).toBe(true);
    expect(mockOutboxAdd).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'file' }));
  });

  it('should build correct file network payload', async () => {
    const { sendToPeer } = await import('$lib/features/webrtc/dataChannels/channel.util');

    const action = {
      type: 'file' as const,
      messageId: 'file_123',
      peerId: 'peer_1',
      fileId: 'file_123',
      meta: {
        id: 'file_123',
        senderId: 'me_123',
        name: 'test.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        totalChunks: 1
      }
    };

    await manager.executeAtomicAction(action);

    expect(sendToPeer).toHaveBeenCalledWith(
      'peer_1',
      expect.objectContaining({
        type: 'file_meta',
        meta: expect.objectContaining({ name: 'test.pdf' }),
        peerId: 'peer_1'
      }),
      { skipOutbox: true }
    );
  });

  // ───────────── system transaction ─────────────
  it('should execute successful system transaction', async () => {
    const action = {
      type: 'system' as const,
      messageId: 'sys_123',
      peerId: 'peer_1',
      systemEvent: 'screenShareStart' as const
    };

    const result = await manager.executeAtomicAction(action);

    expect(result.success).toBe(true);
    expect(mockOutboxAdd).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'system' }));
  });

  it('should build correct system network payload', async () => {
    const { sendToPeer } = await import('$lib/features/webrtc/dataChannels/channel.util');

    const action = {
      type: 'system' as const,
      messageId: 'sys_123',
      peerId: 'peer_1',
      systemEvent: 'callAccepted' as const
    };

    await manager.executeAtomicAction(action);

    expect(sendToPeer).toHaveBeenCalledWith(
      'peer_1',
      expect.objectContaining({
        type: 'chat',
        message: expect.objectContaining({ systemEvent: 'callAccepted' }),
        peerId: 'peer_1'
      }),
      { skipOutbox: true }
    );
  });
});
