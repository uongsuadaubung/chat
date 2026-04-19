// tests/messageChannel.transaction.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pinMessage,
  editMessage,
  deleteMessage,
  reactMessage
} from '$lib/features/webrtc/dataChannels/messageChannel';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';

vi.mock('$lib/features/webrtc/atomicActionManager', () => ({
  atomicActionManager: {
    executeAtomicAction: vi.fn()
  }
}));

// sendChat is used internally for system messages — mock the full module
vi.mock('$lib/features/webrtc/dataChannels/messageChannel', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('$lib/features/webrtc/dataChannels/messageChannel')>();
  return {
    ...mod,
    sendChat: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock('$lib/shared/stores/toast.store.svelte', () => ({
  toast: { error: vi.fn() }
}));

vi.mock('$lib/core/db', () => ({
  db: {
    transactional_outbox: {
      add: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(undefined)
    }
  },
  saveMessageToDB: vi.fn().mockResolvedValue(undefined),
  deleteFileBlobFromDB: vi.fn(),
  getFileBlobFromDB: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/features/webrtc/dataChannels/channel.util', () => ({
  sendToPeer: vi.fn()
}));

const BASE_MSG = {
  id: 'msg_123',
  senderId: 'peer_1',
  senderName: 'Peer',
  peerId: 'peer_1',
  timestamp: 1000,
  isSelf: false,
  type: 'text' as const,
  text: 'Hello world'
};

describe('Transactional messageChannel', () => {
  beforeEach(() => {
    ctx.messages = { peer_1: [{ ...BASE_MSG }] };
    ctx.currentUser = { id: 'me_123', name: 'Me' };

    const mockExecute = vi.mocked(atomicActionManager.executeAtomicAction);
    mockExecute.mockClear();
    mockExecute.mockImplementation(async (_action, uiUpdateCallback) => {
      uiUpdateCallback?.();
      return { success: true };
    });
  });

  // ─── pinMessage ───
  it('should delegate pin to atomicActionManager', async () => {
    await pinMessage('msg_123', true, 'peer_1');

    expect(atomicActionManager.executeAtomicAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pin',
        messageId: 'msg_123',
        isPinned: true,
        peerId: 'peer_1'
      }),
      expect.any(Function)
    );
  });

  // ─── editMessage ───
  it('should delegate edit to atomicActionManager', async () => {
    await editMessage('msg_123', 'updated text', 'peer_1');

    expect(atomicActionManager.executeAtomicAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit',
        messageId: 'msg_123',
        peerId: 'peer_1',
        newText: 'updated text'
      }),
      expect.any(Function)
    );
  });

  it('editMessage optimistic update should set text + isEdited', async () => {
    let capturedCallback: (() => void) | undefined;

    vi.mocked(atomicActionManager.executeAtomicAction).mockImplementationOnce(
      async (_action, callback) => {
        capturedCallback = callback;
        return { success: true };
      }
    );

    await editMessage('msg_123', 'new text', 'peer_1');
    capturedCallback?.();

    const msg = ctx.messages['peer_1']?.[0];
    expect(msg?.text).toBe('new text');
    expect(msg?.isEdited).toBe(true);
  });

  it('editMessage should show toast on failure', async () => {
    const { toast } = await import('$lib/shared/stores/toast.store.svelte');
    vi.mocked(atomicActionManager.executeAtomicAction).mockResolvedValueOnce({
      success: false,
      error: 'DB error'
    });

    await editMessage('msg_123', 'fail text', 'peer_1');

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Không thể sửa tin nhắn'));
  });

  // ─── deleteMessage ───
  it('should delegate syncGlobal delete to atomicActionManager', async () => {
    await deleteMessage('msg_123', 'peer_1', true);

    expect(atomicActionManager.executeAtomicAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delete',
        messageId: 'msg_123',
        peerId: 'peer_1',
        syncGlobal: true
      }),
      expect.any(Function)
    );
  });

  it('should delegate hide-local delete to atomicActionManager', async () => {
    await deleteMessage('msg_123', 'peer_1', false);

    expect(atomicActionManager.executeAtomicAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delete',
        syncGlobal: false
      }),
      expect.any(Function)
    );
  });

  it('deleteMessage optimistic update (syncGlobal) should mark isDeleted', async () => {
    let capturedCallback: (() => void) | undefined;

    vi.mocked(atomicActionManager.executeAtomicAction).mockImplementationOnce(
      async (_action, callback) => {
        capturedCallback = callback;
        return { success: true };
      }
    );

    await deleteMessage('msg_123', 'peer_1', true);
    capturedCallback?.();

    const msg = ctx.messages['peer_1']?.[0];
    expect(msg?.isDeleted).toBe(true);
    expect(msg?.text).toBeUndefined();
  });

  it('deleteMessage should show toast on failure', async () => {
    const { toast } = await import('$lib/shared/stores/toast.store.svelte');
    vi.mocked(atomicActionManager.executeAtomicAction).mockResolvedValueOnce({
      success: false,
      error: 'network error'
    });

    await deleteMessage('msg_123', 'peer_1', true);

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Không thể xóa tin nhắn'));
  });

  // ─── reactMessage ───
  it('should delegate react to atomicActionManager', async () => {
    await reactMessage('msg_123', '❤️', 'peer_1');

    expect(atomicActionManager.executeAtomicAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'react',
        messageId: 'msg_123',
        peerId: 'peer_1',
        reaction: '❤️'
      }),
      expect.any(Function)
    );
  });

  it('reactMessage optimistic update should apply reaction', async () => {
    let capturedCallback: (() => void) | undefined;

    vi.mocked(atomicActionManager.executeAtomicAction).mockImplementationOnce(
      async (_action, callback) => {
        capturedCallback = callback;
        return { success: true };
      }
    );

    await reactMessage('msg_123', '👍', 'peer_1');
    capturedCallback?.();

    const msg = ctx.messages['peer_1']?.[0];
    expect(msg?.reactions?.['me_123']).toBe('👍');
  });

  it('reactMessage optimistic update should toggle reaction off', async () => {
    // Pre-set reaction
    ctx.messages = {
      peer_1: [{ ...BASE_MSG, reactions: { me_123: '👍' } }]
    };

    let capturedCallback: (() => void) | undefined;

    vi.mocked(atomicActionManager.executeAtomicAction).mockImplementationOnce(
      async (_action, callback) => {
        capturedCallback = callback;
        return { success: true };
      }
    );

    await reactMessage('msg_123', '👍', 'peer_1'); // same → toggle off
    capturedCallback?.();

    const msg = ctx.messages['peer_1']?.[0];
    expect(msg?.reactions?.['me_123']).toBeUndefined();
  });

  it('reactMessage should show toast on failure', async () => {
    const { toast } = await import('$lib/shared/stores/toast.store.svelte');
    vi.mocked(atomicActionManager.executeAtomicAction).mockResolvedValueOnce({
      success: false,
      error: 'network fail'
    });

    await reactMessage('msg_123', '😂', 'peer_1');

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Không thể thả reaction'));
  });

  // ─── early return guards ───
  it('should do nothing if currentUser is null', async () => {
    ctx.currentUser = null;
    await editMessage('msg_123', 'text', 'peer_1');
    await deleteMessage('msg_123', 'peer_1');
    await reactMessage('msg_123', '👍', 'peer_1');
    expect(atomicActionManager.executeAtomicAction).not.toHaveBeenCalled();
  });
});
