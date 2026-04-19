// src/lib/features/webrtc/atomicActionManager.ts
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { db, saveMessageToDB } from '$lib/core/db';
import { sendToPeer } from '$lib/features/webrtc/dataChannels/channel.util';
import { log } from '$lib/core/logger';
import type {
  AtomicAction,
  TransactionResult,
  TransactionalOutboxRecord
} from './transaction.type';
import type { ChatMessage, DataChannelPayload } from '$lib/features/chat/types/chat.type';
import { captureOriginalState, createRollbackAction, type OriginalState } from './transaction.util';

const NETWORK_SIGNAL_TIMEOUT_MS = 5000;

export class AtomicActionManager {
  private maxRetries = 3;

  /**
   * Execute atomic action with automatic optimistic update and rollback
   */
  async executeAtomicAction(
    action: AtomicAction,
    optimisticUpdate?: () => void
  ): Promise<TransactionResult> {
    let originalState: OriginalState;
    try {
      originalState = captureOriginalState(action);
    } catch (error) {
      return { success: false, error: `Cannot capture state: ${error}` };
    }

    const applyOptimisticUpdate = () => {
      if (optimisticUpdate) {
        optimisticUpdate();
      } else {
        this.applyDefaultOptimisticUpdate(action);
      }
    };

    applyOptimisticUpdate();

    let outboxId: number | undefined;

    try {
      outboxId = await this.saveToTransactionalOutbox(action, originalState);
      await this.markOutboxProcessing(outboxId);
      await this.executeDBAction(action, originalState);
      await this.sendNetworkSignalWithTimeout(action);
      await this.markOutboxCompleted(outboxId, action);

      return { success: true, outboxId };
    } catch (error) {
      await this.rollbackTransaction(action, originalState, error, outboxId);
      return { success: false, error: String(error), outboxId };
    }
  }

  private applyDefaultOptimisticUpdate(action: AtomicAction): void {
    const m = ctx.messages;
    const roomMsgs = m[action.peerId] || [];
    const idx = roomMsgs.findIndex((m) => m.id === action.messageId);

    if (idx === -1) return;

    const updated: ChatMessage[] = [...roomMsgs];
    const msg: ChatMessage = { ...updated[idx] };

    switch (action.type) {
      case 'pin':
        msg.isPinned = action.isPinned;
        break;
      case 'edit':
        msg.text = action.newText;
        msg.isEdited = true;
        break;
      case 'delete':
        if (action.syncGlobal) {
          msg.isDeleted = true;
          msg.text = undefined;
          msg.file = undefined;
          msg.replyPreview = undefined;
        } else {
          msg.hiddenFromPeers = [...(msg.hiddenFromPeers || []), ctx.currentUser!.id];
        }
        break;
      case 'react': {
        const reactions: Record<string, string> = { ...(msg.reactions || {}) };
        if (action.reaction) {
          if (reactions[ctx.currentUser!.id] === action.reaction) {
            delete reactions[ctx.currentUser!.id];
          } else {
            reactions[ctx.currentUser!.id] = action.reaction;
          }
        }
        msg.reactions = reactions;
        break;
      }
    }

    updated[idx] = msg;
    ctx.messages = { ...m, [action.peerId]: updated };
  }

  private async markOutboxProcessing(outboxId: number): Promise<void> {
    await db.transactional_outbox.update(outboxId, {
      status: 'processing',
      updatedAt: Date.now()
    });
  }

  private async saveToTransactionalOutbox(
    action: AtomicAction,
    originalState: OriginalState
  ): Promise<number> {
    const record: TransactionalOutboxRecord = {
      peerId: action.peerId,
      actionType: action.type,
      payload: this.createNetworkPayload(action),
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retries: 0,
      maxRetries: this.maxRetries,
      originalState,
      rollbackAction: createRollbackAction(action),
      fullAction: action
    };

    return await db.transactional_outbox.add(record);
  }

  private createNetworkPayload(action: AtomicAction): DataChannelPayload {
    switch (action.type) {
      case 'pin':
        return {
          type: 'message_pin',
          messageId: action.messageId,
          isPinned: action.isPinned,
          peerId: action.peerId
        };
      case 'edit':
        return {
          type: 'message_edit',
          messageId: action.messageId,
          newText: action.newText,
          peerId: action.peerId
        };
      case 'delete':
        return {
          type: action.syncGlobal ? 'message_delete' : 'message_hide_local',
          messageId: action.messageId,
          peerId: action.peerId
        };
      case 'react':
        return {
          type: 'message_react',
          messageId: action.messageId,
          reaction: action.reaction,
          peerId: action.peerId
        };
      case 'chat':
        return {
          type: 'chat',
          message: action.message,
          peerId: action.peerId
        };
      case 'file':
        return {
          type: 'file_meta',
          meta: action.meta,
          peerId: action.peerId
        };
      case 'system':
        return {
          type: 'chat',
          message: {
            id: action.messageId,
            senderId: ctx.currentUser?.id || '',
            senderName: ctx.currentUser?.name || '',
            peerId: action.peerId,
            timestamp: Date.now(),
            isSelf: true,
            type: 'system',
            systemEvent: action.systemEvent
          },
          peerId: action.peerId
        };
      default: {
        const exhaustiveCheck: never = action;
        throw new Error(`Unknown action type: ${exhaustiveCheck}`);
      }
    }
  }

  private async executeDBAction(action: AtomicAction, originalState: OriginalState): Promise<void> {
    const updatedMsg = this.buildUpdatedMessage(action, originalState);
    await saveMessageToDB(updatedMsg);
  }

  private buildUpdatedMessage(action: AtomicAction, originalState: OriginalState): ChatMessage {
    const baseMsg = this.getMessageFromOriginalState(action, originalState);
    const msg: ChatMessage = { ...baseMsg };

    switch (action.type) {
      case 'pin':
        msg.isPinned = action.isPinned;
        msg.updatedAt = Date.now();
        break;
      case 'edit':
        msg.text = action.newText;
        msg.isEdited = true;
        msg.updatedAt = Date.now();
        break;
      case 'delete':
        if (action.syncGlobal) {
          msg.isDeleted = true;
          msg.text = undefined;
          msg.file = undefined;
          msg.replyPreview = undefined;
        } else {
          msg.hiddenFromPeers = [...(msg.hiddenFromPeers || []), ctx.currentUser!.id];
        }
        msg.updatedAt = Date.now();
        break;
      case 'react': {
        const reactions: Record<string, string> = { ...(msg.reactions || {}) };
        if (action.reaction) {
          if (reactions[ctx.currentUser!.id] === action.reaction) {
            delete reactions[ctx.currentUser!.id];
          } else {
            reactions[ctx.currentUser!.id] = action.reaction;
          }
        } else {
          delete reactions[ctx.currentUser!.id];
        }
        msg.reactions = reactions;
        msg.updatedAt = Date.now();
        break;
      }
      case 'chat':
      case 'file':
      case 'system':
        msg.isPending = false;
        msg.updatedAt = Date.now();
        break;
    }

    return msg;
  }

  private getMessageFromOriginalState(
    action: AtomicAction,
    originalState: OriginalState
  ): ChatMessage {
    switch (action.type) {
      case 'pin':
        return {
          id: action.messageId,
          peerId: action.peerId,
          isPinned: (originalState as { isPinned: boolean }).isPinned
        } as ChatMessage;
      case 'edit':
        return {
          id: action.messageId,
          peerId: action.peerId,
          text: (originalState as { text: string }).text
        } as ChatMessage;
      case 'delete': {
        const deletedMsg = (originalState as { message: ChatMessage }).message;
        return { ...deletedMsg, peerId: action.peerId } as ChatMessage;
      }
      case 'react':
        return {
          id: action.messageId,
          peerId: action.peerId,
          reactions: (originalState as { reactions: Record<string, string> }).reactions
        } as ChatMessage;
      case 'chat':
        return {
          ...action.message,
          peerId: action.peerId,
          isPending: true // Original state when sending is pending
        } as ChatMessage;
      case 'file':
      case 'system':
        return { id: action.messageId, peerId: action.peerId } as ChatMessage;
    }
  }

  private async sendNetworkSignalWithTimeout(action: AtomicAction): Promise<void> {
    const payload = this.createNetworkPayload(action);

    const signalPromise = sendToPeer(action.peerId, payload, { skipOutbox: true });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Network signal timeout')), NETWORK_SIGNAL_TIMEOUT_MS);
    });

    try {
      await Promise.race([
        // sendToPeer as used in channel.util.ts is sync, so it doesn't return a Promise.
        // We might need to wrap it if we want actual confirmation, but for now
        // we assume hand-off is enough for "sent" status in local UI.
        Promise.resolve(signalPromise),
        timeoutPromise
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === 'Network signal timeout') {
        throw new Error('Network timeout - message saved locally, will retry later', {
          cause: error
        });
      }
      throw error;
    }
  }

  private async markOutboxCompleted(outboxId: number, action?: AtomicAction): Promise<void> {
    await db.transactional_outbox.update(outboxId, {
      status: 'completed',
      updatedAt: Date.now()
    });

    // If it's a chat/file/system action, we need to update UI to clear isPending
    if (action && (action.type === 'chat' || action.type === 'file' || action.type === 'system')) {
      const m = ctx.messages;
      const roomMsgs = m[action.peerId] || [];
      const idx = roomMsgs.findIndex((msg) => msg.id === action.messageId);

      if (idx !== -1) {
        const updated = [...roomMsgs];
        updated[idx] = { ...updated[idx], isPending: false, updatedAt: Date.now() };
        ctx.messages = { ...m, [action.peerId]: updated };
      }
    }
  }

  private async rollbackTransaction(
    action: AtomicAction,
    originalState: OriginalState,
    error: unknown,
    outboxId?: number
  ): Promise<void> {
    log.transaction.error(`Rolling back transaction for ${action.type}:`, error);

    this.rollbackUIState(action, originalState);

    if (outboxId) {
      await db.transactional_outbox.update(outboxId, {
        status: 'rolled_back',
        error: String(error),
        updatedAt: Date.now()
      });
    }
  }

  private rollbackUIState(action: AtomicAction, originalState: OriginalState): void {
    const m = ctx.messages;
    const roomMsgs = m[action.peerId] || [];
    const idx = roomMsgs.findIndex((m) => m.id === action.messageId);

    if (idx === -1) return;

    const updated: ChatMessage[] = [...roomMsgs];

    switch (action.type) {
      case 'pin':
        updated[idx] = {
          ...updated[idx],
          isPinned: (originalState as { isPinned: boolean }).isPinned
        };
        break;
      case 'edit':
        updated[idx] = {
          ...updated[idx],
          text: (originalState as { text: string }).text,
          isEdited: updated[idx].isEdited
        };
        break;
      case 'delete':
        updated[idx] = { ...(originalState as { message: ChatMessage }).message };
        break;
      case 'react':
        updated[idx] = {
          ...updated[idx],
          reactions: (originalState as { reactions: Record<string, string> }).reactions
        };
        break;
    }

    ctx.messages = { ...m, [action.peerId]: updated };
  }

  /**
   * Process all pending/failed/rolled_back transactions for a specific peer
   * Called when WebRTC connection is established.
   */
  async processOutboxForPeer(peerId: string): Promise<void> {
    const unfinished = await db.transactional_outbox
      .where('peerId')
      .equals(peerId)
      .and(
        (tx) =>
          tx.status === 'pending' ||
          tx.status === 'processing' ||
          tx.status === 'failed' ||
          tx.status === 'rolled_back'
      )
      .toArray();

    if (unfinished.length === 0) return;

    // Sort by createdAt to maintain sequence
    unfinished.sort((a, b) => a.createdAt - b.createdAt);

    log.transaction.info(`Auto-retrying ${unfinished.length} transactions for ${peerId}`);

    for (const tx of unfinished) {
      if (tx.id) {
        await this.retryTransaction(tx.id);
      }
    }
  }

  async retryTransaction(outboxId: number): Promise<boolean> {
    const tx = await db.transactional_outbox.get(outboxId);
    if (!tx || tx.status === 'completed' || tx.retries >= tx.maxRetries) {
      return false;
    }

    try {
      await db.transactional_outbox.update(outboxId, {
        status: 'processing',
        updatedAt: Date.now()
      });

      await sendToPeer(tx.peerId, tx.payload, { skipOutbox: true });

      // If it was rolled_back, we need to re-apply UI state if we have the full action
      if (tx.status === 'rolled_back' && tx.fullAction) {
        this.applyDefaultOptimisticUpdate(tx.fullAction as AtomicAction);
        if (tx.originalState) {
          await this.executeDBAction(tx.fullAction as AtomicAction, tx.originalState);
        }
      }

      await this.markOutboxCompleted(outboxId, tx.fullAction as AtomicAction);

      log.transaction.info(`Transaction ${outboxId} (${tx.actionType}) retry succeeded`);
      return true;
    } catch (error) {
      const isTimeout = error instanceof Error && error.message.includes('timeout');

      await db.transactional_outbox.update(outboxId, {
        status: isTimeout ? 'rolled_back' : 'failed',
        retries: tx.retries + 1,
        error: String(error),
        updatedAt: Date.now()
      });

      log.transaction.error(`Transaction ${outboxId} retry failed:`, error);
      return false;
    }
  }

  async retryFailedTransaction(outboxId: number): Promise<boolean> {
    return this.retryTransaction(outboxId);
  }

  async cleanupOldTransactions(): Promise<void> {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const oldCompleted = await db.transactional_outbox
      .where('status')
      .equals('completed')
      .and((tx) => tx.updatedAt < weekAgo)
      .toArray();

    const ids = oldCompleted.map((tx) => tx.id!).filter((id): id is number => id !== undefined);

    if (ids.length > 0) {
      await db.transactional_outbox.bulkDelete(ids);
      log.transaction.info(`Cleaned up ${ids.length} old completed transactions`);
    }
  }
}

export const atomicActionManager = new AtomicActionManager();
