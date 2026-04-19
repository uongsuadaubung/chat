// src/lib/features/webrtc/transaction.type.test.ts
import { describe, it, expect } from 'vitest';
import type {
  AtomicAction,
  AtomicActionType,
  TransactionResult,
  TransactionalOutboxRecord,
  TransactionStatus
} from '$lib/features/webrtc/transaction.type';

describe('Transaction Types', () => {
  // ─── AtomicAction — pin ───
  describe('AtomicAction — pin', () => {
    it('should accept valid pin action', () => {
      const action: AtomicAction = {
        type: 'pin',
        messageId: 'msg_123',
        peerId: 'peer_1',
        isPinned: true
      };
      expect(action.type).toBe('pin');
      expect(action.messageId).toBe('msg_123');
      expect(action.isPinned).toBe(true);
    });

    it('should accept pin=false (unpin)', () => {
      const action: AtomicAction = {
        type: 'pin',
        messageId: 'msg_456',
        peerId: 'peer_2',
        isPinned: false
      };
      expect(action.isPinned).toBe(false);
    });

    it('should accept optional originalIsPinned field', () => {
      const action: AtomicAction = {
        type: 'pin',
        messageId: 'msg_789',
        peerId: 'peer_1',
        isPinned: true,
        originalIsPinned: false
      };
      expect(action.originalIsPinned).toBe(false);
    });
  });

  // ─── AtomicAction — edit ───
  describe('AtomicAction — edit', () => {
    it('should accept valid edit action', () => {
      const action: AtomicAction = {
        type: 'edit',
        messageId: 'msg_edit',
        peerId: 'peer_1',
        newText: 'Updated message'
      };
      expect(action.type).toBe('edit');
      expect(action.newText).toBe('Updated message');
    });

    it('should accept empty newText (clearing message)', () => {
      const action: AtomicAction = {
        type: 'edit',
        messageId: 'msg_clear',
        peerId: 'peer_1',
        newText: ''
      };
      expect(action.newText).toBe('');
    });

    it('should accept optional originalText field', () => {
      const action: AtomicAction = {
        type: 'edit',
        messageId: 'msg_edit',
        peerId: 'peer_1',
        newText: 'New',
        originalText: 'Old text'
      };
      expect(action.originalText).toBe('Old text');
    });
  });

  // ─── AtomicAction — delete ───
  describe('AtomicAction — delete', () => {
    it('should accept sync-global delete', () => {
      const action: AtomicAction = {
        type: 'delete',
        messageId: 'msg_del',
        peerId: 'peer_1',
        syncGlobal: true
      };
      expect(action.type).toBe('delete');
      expect(action.syncGlobal).toBe(true);
    });

    it('should accept hide-local delete (syncGlobal=false)', () => {
      const action: AtomicAction = {
        type: 'delete',
        messageId: 'msg_hide',
        peerId: 'peer_1',
        syncGlobal: false
      };
      expect(action.syncGlobal).toBe(false);
    });
  });

  // ─── AtomicAction — react ───
  describe('AtomicAction — react', () => {
    it('should accept valid react action with emoji', () => {
      const action: AtomicAction = {
        type: 'react',
        messageId: 'msg_react',
        peerId: 'peer_1',
        reaction: '❤️'
      };
      expect(action.type).toBe('react');
      expect(action.reaction).toBe('❤️');
    });

    it('should accept empty reaction string (remove reaction)', () => {
      const action: AtomicAction = {
        type: 'react',
        messageId: 'msg_react',
        peerId: 'peer_1',
        reaction: ''
      };
      expect(action.reaction).toBe('');
    });

    it('should accept optional originalReactions field', () => {
      const action: AtomicAction = {
        type: 'react',
        messageId: 'msg_react',
        peerId: 'peer_1',
        reaction: '👍',
        originalReactions: { user_1: '❤️' }
      };
      expect(action.originalReactions).toEqual({ user_1: '❤️' });
    });
  });

  // ─── AtomicActionType union ───
  describe('AtomicActionType union', () => {
    it('should include all 4 valid action types', () => {
      const valid: AtomicActionType[] = ['pin', 'edit', 'delete', 'react'];
      expect(valid).toHaveLength(4);
      valid.forEach((t) => expect(typeof t).toBe('string'));
    });
  });

  // ─── TransactionResult ───
  describe('TransactionResult', () => {
    it('should represent a successful result', () => {
      const result: TransactionResult = { success: true, outboxId: 42 };
      expect(result.success).toBe(true);
      expect(result.outboxId).toBe(42);
    });

    it('should represent a failed result with error message', () => {
      const result: TransactionResult = { success: false, error: 'Network timeout' };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });

    it('should allow result without outboxId or error', () => {
      const result: TransactionResult = { success: true };
      expect(result.outboxId).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });

  // ─── TransactionStatus union ───
  describe('TransactionStatus', () => {
    it('should cover all valid status values', () => {
      const statuses: TransactionStatus[] = [
        'pending',
        'processing',
        'completed',
        'failed',
        'rolled_back'
      ];
      expect(statuses).toHaveLength(5);
    });
  });

  // ─── TransactionalOutboxRecord ───
  describe('TransactionalOutboxRecord', () => {
    it('should construct a valid completed record', () => {
      const record: TransactionalOutboxRecord = {
        peerId: 'peer_1',
        actionType: 'edit',
        payload: {
          type: 'message_edit',
          messageId: 'msg_123',
          newText: 'hello',
          peerId: 'peer_1'
        },
        status: 'completed',
        createdAt: 1000,
        updatedAt: 2000,
        retries: 0,
        maxRetries: 3
      };
      expect(record.actionType).toBe('edit');
      expect(record.status).toBe('completed');
      expect(record.retries).toBe(0);
    });

    it('should accept a failed record with error details', () => {
      const record: TransactionalOutboxRecord = {
        peerId: 'peer_1',
        actionType: 'delete',
        payload: { type: 'message_delete', messageId: 'msg_del', peerId: 'peer_1' },
        status: 'failed',
        createdAt: 1000,
        updatedAt: 3000,
        retries: 3,
        maxRetries: 3,
        error: 'Peer disconnected'
      };
      expect(record.status).toBe('failed');
      expect(record.retries).toBe(record.maxRetries);
      expect(record.error).toBe('Peer disconnected');
    });

    it('should allow optional id field (assigned by Dexie after insert)', () => {
      const withoutId: TransactionalOutboxRecord = {
        peerId: 'peer_1',
        actionType: 'react',
        payload: {
          type: 'message_react',
          messageId: 'msg_123',
          reaction: '👍',
          peerId: 'peer_1'
        },
        status: 'pending',
        createdAt: 1000,
        updatedAt: 1000,
        retries: 0,
        maxRetries: 3
      };
      expect(withoutId.id).toBeUndefined();

      const withId: TransactionalOutboxRecord = { ...withoutId, id: 99 };
      expect(withId.id).toBe(99);
    });
  });
});
