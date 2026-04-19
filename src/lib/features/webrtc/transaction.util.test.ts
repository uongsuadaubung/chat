// tests/transaction.util.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { captureOriginalState, createRollbackAction } from '$lib/features/webrtc/transaction.util';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import type { ChatMessage } from '$lib/type';

describe('Transaction Utilities', () => {
  const mockMessage: ChatMessage = {
    id: 'msg_123',
    senderId: 'peer_1',
    senderName: 'Peer',
    peerId: 'peer_1',
    text: 'Hello World',
    isPinned: false,
    timestamp: 1000,
    isSelf: false
  };

  const mockMessageWithReactions: ChatMessage = {
    ...mockMessage,
    senderId: 'peer_2',
    senderName: 'Peer 2',
    reactions: { '👍': 'user1', '❤️': 'user2' }
  };

  beforeEach(() => {
    ctx.messages = {
      peer_1: [mockMessage],
      peer_2: [mockMessageWithReactions]
    };
  });

  describe('captureOriginalState', () => {
    it('should capture original state for pin action', () => {
      const action = {
        type: 'pin' as const,
        messageId: 'msg_123',
        peerId: 'peer_1',
        isPinned: true
      };
      const state = captureOriginalState(action);

      expect(state).toEqual({ isPinned: false });
    });

    it('should capture original state for edit action', () => {
      const action = {
        type: 'edit' as const,
        messageId: 'msg_123',
        peerId: 'peer_1',
        newText: 'Updated'
      };
      const state = captureOriginalState(action);

      expect(state).toEqual({ text: 'Hello World' });
    });

    it('should capture original state for delete action', () => {
      const action = {
        type: 'delete' as const,
        messageId: 'msg_123',
        peerId: 'peer_1',
        syncGlobal: true
      };
      const state = captureOriginalState(action);

      expect(state).toEqual({ message: mockMessage });
    });

    it('should capture original state for react action', () => {
      const action = {
        type: 'react' as const,
        messageId: 'msg_123',
        peerId: 'peer_2',
        reaction: '🔥'
      };
      const state = captureOriginalState(action);

      expect(state).toEqual({ reactions: { '👍': 'user1', '❤️': 'user2' } });
    });

    it('should throw error when message not found', () => {
      const action = {
        type: 'pin' as const,
        messageId: 'non_existent',
        peerId: 'peer_1',
        isPinned: true
      };

      expect(() => captureOriginalState(action)).toThrow(
        'Message non_existent not found in room peer_1'
      );
    });

    it('should handle message without reactions for react action', () => {
      const action = {
        type: 'react' as const,
        messageId: 'msg_123',
        peerId: 'peer_1',
        reaction: '🔥'
      };
      const state = captureOriginalState(action);

      expect(state).toEqual({ reactions: {} });
    });
  });

  describe('createRollbackAction', () => {
    it('should create correct rollback action for pin', () => {
      const action = {
        type: 'pin' as const,
        messageId: 'msg_123',
        peerId: 'peer_1',
        isPinned: true
      };
      const rollback = createRollbackAction(action);

      expect(rollback).toBe('unpin');
    });

    it('should create correct rollback action for edit', () => {
      const action = {
        type: 'edit' as const,
        messageId: 'msg_123',
        peerId: 'peer_1',
        newText: 'Updated'
      };
      const rollback = createRollbackAction(action);

      expect(rollback).toBe('restore_text');
    });

    it('should create correct rollback action for delete', () => {
      const action = {
        type: 'delete' as const,
        messageId: 'msg_123',
        peerId: 'peer_1',
        syncGlobal: true
      };
      const rollback = createRollbackAction(action);

      expect(rollback).toBe('restore_message');
    });

    it('should create correct rollback action for react', () => {
      const action = {
        type: 'react' as const,
        messageId: 'msg_123',
        peerId: 'peer_1',
        reaction: '🔥'
      };
      const rollback = createRollbackAction(action);

      expect(rollback).toBe('remove_reaction');
    });
  });
});
