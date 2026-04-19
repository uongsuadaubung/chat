import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ctx } from '../webrtc.context.svelte';
import { addMessage, pinMessage } from './messageChannel';
import type { ChatMessage } from '$lib/type';
import { sendToPeer } from '$lib/features/webrtc/dataChannels/channel.util';
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';

// Mock sendToPeer
vi.mock('$lib/features/webrtc/dataChannels/channel.util', () => ({
  sendToPeer: vi.fn()
}));

// Mock atomicActionManager
vi.mock('$lib/features/webrtc/atomicActionManager', () => ({
  atomicActionManager: {
    executeAtomicAction: vi.fn()
  }
}));

describe('Pin Message Fix Tests', () => {
  beforeEach(() => {
    ctx.messages = {};
    ctx.currentUser = { id: 'me_123', name: 'Me' };

    // Reset mocks
    vi.mocked(sendToPeer).mockClear();
    const mockExecuteAtomicAction = vi.mocked(atomicActionManager.executeAtomicAction);
    mockExecuteAtomicAction.mockClear();
    mockExecuteAtomicAction.mockImplementation(async (action, uiUpdateCallback) => {
      // Simulate the UI update that would happen in a real transaction
      if (uiUpdateCallback) {
        uiUpdateCallback();
      }
      return { success: true };
    });
  });

  // Test 1: Fix DataCloneError when pinning image messages
  it('should pin image message without DataCloneError', async () => {
    const imageMsg: ChatMessage = {
      id: 'img_msg',
      senderId: 'peer_1',
      senderName: 'Peer',
      peerId: 'peer_1',
      timestamp: Date.now(),
      isSelf: false,
      type: 'file',
      text: 'Image caption',
      file: {
        name: 'image.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
        url: 'blob:test'
      }
    };

    // Add message
    await addMessage(imageMsg);

    // Check message was added
    expect(ctx.messages['peer_1']).toBeDefined();
    expect(ctx.messages['peer_1']?.[0]?.id).toBe('img_msg');

    // Pin should not throw DataCloneError
    await expect(pinMessage('img_msg', true, 'peer_1')).resolves.not.toThrow();

    const pinnedMsg = ctx.messages['peer_1']?.[0];
    expect(pinnedMsg?.isPinned).toBe(true);
    expect(pinnedMsg?.text).toBe('Image caption');
  });

  // Test 2: Boolean(isPinned) query fix
  it('should handle isPinned states correctly', () => {
    const messages: Partial<ChatMessage>[] = [
      { id: 'msg1', isPinned: undefined },
      { id: 'msg2', isPinned: true },
      { id: 'msg3', isPinned: false }
    ];

    // Test Boolean(isPinned) logic (fix for db query)
    const pinnedOnly = messages.filter((m) => Boolean(m.isPinned));
    expect(pinnedOnly).toHaveLength(1);
    expect(pinnedOnly[0].id).toBe('msg2');
  });

  // Test 3: Pin/Unpin toggle
  it('should toggle pin status correctly', async () => {
    const textMsg: ChatMessage = {
      id: 'toggle_msg',
      senderId: 'peer_1',
      senderName: 'Peer',
      peerId: 'peer_1',
      timestamp: Date.now(),
      isSelf: false,
      type: 'text',
      text: 'Toggle test'
    };

    await addMessage(textMsg);
    expect(ctx.messages['peer_1']?.[0]?.id).toBe('toggle_msg');

    // Pin
    await pinMessage('toggle_msg', true, 'peer_1');
    expect(ctx.messages['peer_1']?.[0]?.isPinned).toBe(true);

    // Unpin
    await pinMessage('toggle_msg', false, 'peer_1');
    expect(ctx.messages['peer_1']?.[0]?.isPinned).toBe(false);

    // Pin again
    await pinMessage('toggle_msg', true, 'peer_1');
    expect(ctx.messages['peer_1']?.[0]?.isPinned).toBe(true);
  });

  // Test 4: Send pin signal to peer via atomic transaction
  it('should send pin signal to peer via atomic transaction', async () => {
    const msg: ChatMessage = {
      id: 'signal_msg',
      senderId: 'peer_1',
      senderName: 'Peer',
      peerId: 'peer_1',
      timestamp: Date.now(),
      isSelf: false,
      type: 'text',
      text: 'Test signal'
    };

    await addMessage(msg);

    // Mock successful atomic transaction
    const mockExecuteAtomicAction = vi.mocked(atomicActionManager.executeAtomicAction);
    mockExecuteAtomicAction.mockResolvedValue({ success: true });

    await pinMessage('signal_msg', true, 'peer_1');

    // Verify atomic action was called with correct parameters
    expect(mockExecuteAtomicAction).toHaveBeenCalledWith(
      {
        type: 'pin',
        messageId: 'signal_msg',
        peerId: 'peer_1',
        isPinned: true
      },
      expect.any(Function) // UI update callback
    );
  });

  // Test 5: Handle non-existent message gracefully with atomic transaction
  it('should handle non-existent message gracefully with atomic transaction', async () => {
    // Mock successful atomic transaction even for non-existent message
    const mockExecuteAtomicAction = vi.mocked(atomicActionManager.executeAtomicAction);
    mockExecuteAtomicAction.mockResolvedValue({ success: true });

    await pinMessage('non_existent', true, 'peer_1');

    // Verify atomic action was called
    expect(mockExecuteAtomicAction).toHaveBeenCalledWith(
      {
        type: 'pin',
        messageId: 'non_existent',
        peerId: 'peer_1',
        isPinned: true
      },
      expect.any(Function)
    );
  });
});
