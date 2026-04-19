// src/lib/features/webrtc/transactionTypes.ts
import { z } from 'zod';
import type { SystemEvent } from '$lib/features/chat/types/chat.type';
import type { ChatMessage } from '$lib/type';

export const TransactionStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'rolled_back'
]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const AtomicActionTypeSchema = z.enum([
  'pin',
  'edit',
  'delete',
  'react',
  'chat',
  'file',
  'system'
]);
export type AtomicActionType = z.infer<typeof AtomicActionTypeSchema>;

export type AtomicAction =
  | {
      type: 'pin';
      messageId: string;
      peerId: string;
      isPinned: boolean;
      originalIsPinned?: boolean;
    }
  | {
      type: 'edit';
      messageId: string;
      peerId: string;
      newText: string;
      originalText?: string;
    }
  | {
      type: 'delete';
      messageId: string;
      peerId: string;
      syncGlobal: boolean;
      originalMessage?: ChatMessage;
    }
  | {
      type: 'react';
      messageId: string;
      peerId: string;
      reaction: string;
      originalReactions?: Record<string, string>;
    }
  | {
      type: 'chat';
      messageId: string;
      peerId: string;
      message: ChatMessage;
    }
  | {
      type: 'file';
      messageId: string;
      peerId: string;
      fileId: string;
      meta: {
        id: string;
        senderId: string;
        name: string;
        size: number;
        mimeType: string;
        totalChunks: number;
        timestamp?: number;
        caption?: string;
      };
    }
  | {
      type: 'system';
      messageId: string;
      peerId: string;
      systemEvent: SystemEvent;
    };

export const RollbackActionSchema = z.enum([
  'unpin',
  'restore_text',
  'restore_message',
  'remove_reaction',
  'retry_send',
  'remove_message',
  'none'
]);
export type RollbackAction = z.infer<typeof RollbackActionSchema>;

export const TransactionalOutboxRecordSchema = z.object({
  id: z.number().optional(),
  peerId: z.string(),
  actionType: AtomicActionTypeSchema,
  payload: z.any(), // DataChannelPayload - schema already defined elsewhere
  status: TransactionStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  retries: z.number(),
  maxRetries: z.number(),
  error: z.string().optional(),
  originalState: z.unknown().optional(),
  rollbackAction: RollbackActionSchema.optional(),
  relatedMessageId: z.string().optional(),
  fullAction: z.any().optional() // AtomicAction
});
export type TransactionalOutboxRecord = z.infer<typeof TransactionalOutboxRecordSchema>;

export const TransactionResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  outboxId: z.number().optional()
});
export type TransactionResult = z.infer<typeof TransactionResultSchema>;
