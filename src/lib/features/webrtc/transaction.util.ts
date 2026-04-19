// src/lib/features/webrtc/transaction.util.ts
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import type { AtomicAction } from './transaction.type';
import type { ChatMessage } from '$lib/type';

export type OriginalState =
  | { isPinned: boolean }
  | { text: string }
  | { message: ChatMessage }
  | { reactions: Record<string, string> }
  | { wasSent: boolean }
  | object;

export function captureOriginalState(action: AtomicAction): OriginalState {
  // For chat/file/system actions, we don't need to capture existing state
  // because these are new messages being sent, not modifications
  if (action.type === 'chat' || action.type === 'file' || action.type === 'system') {
    return { wasSent: false };
  }

  const roomMsgs = ctx.messages[action.peerId] || [];
  const msg = roomMsgs.find((m) => m.id === action.messageId);

  if (!msg) {
    throw new Error(`Message ${action.messageId} not found in room ${action.peerId}`);
  }

  switch (action.type) {
    case 'pin':
      return { isPinned: msg.isPinned || false };
    case 'edit':
      return { text: msg.text || '' };
    case 'delete': {
      // Sanitize message - only keep serializable primitive properties
      const sanitizedMsg = {
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.senderName,
        peerId: msg.peerId,
        text: msg.text,
        timestamp: msg.timestamp,
        isSelf: msg.isSelf,
        type: msg.type,
        systemEvent: msg.systemEvent,
        read: msg.read,
        replyToId: msg.replyToId,
        replyPreview: msg.replyPreview,
        isEdited: msg.isEdited,
        isDeleted: msg.isDeleted,
        isPinned: msg.isPinned,
        hiddenFromPeers: msg.hiddenFromPeers ? ([...msg.hiddenFromPeers] as string[]) : undefined,
        reactions: msg.reactions ? { ...msg.reactions } : undefined,
        status: msg.status,
        updatedAt: msg.updatedAt,
        file: msg.file
          ? {
              name: msg.file.name,
              size: msg.file.size,
              mimeType: msg.file.mimeType,
              progress: msg.file.progress,
              isSending: msg.file.isSending,
              isReceiving: msg.file.isReceiving,
              isPendingDownload: msg.file.isPendingDownload,
              isExpired: msg.file.isExpired,
              error: msg.file.error
            }
          : undefined
      };
      return { message: sanitizedMsg };
    }
    case 'react':
      return { reactions: { ...(msg.reactions || {}) } as Record<string, string> };
    default:
      return {};
  }
}

export function createRollbackAction(
  action: AtomicAction
):
  | 'unpin'
  | 'restore_text'
  | 'restore_message'
  | 'remove_reaction'
  | 'remove_message'
  | 'retry_send'
  | 'none' {
  switch (action.type) {
    case 'pin':
      return 'unpin';
    case 'edit':
      return 'restore_text';
    case 'delete':
      return 'restore_message';
    case 'react':
      return 'remove_reaction';
    case 'chat':
    case 'file':
    case 'system':
      return 'retry_send';
    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`Unknown action type: ${exhaustiveCheck}`);
    }
  }
}
