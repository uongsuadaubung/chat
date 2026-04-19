import Dexie from 'dexie';
import { z } from 'zod';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import type { ChatMessage } from '$lib/features/chat/types/chat.type';
import { SystemEventSchema } from '$lib/features/chat/types/chat.type';
import {
  MAX_MESSAGE_HISTORY,
  MESSAGES_CHUNK_SIZE
} from '$lib/features/chat/constants/chat.constant';
import { sendToPeer } from '$lib/features/webrtc/dataChannels/channel.util';
import {
  db,
  saveMessageToDB,
  deleteFileBlobFromDB,
  getFileBlobFromDB,
  type StoredChatMessage
} from '$lib/core/db';
import { log } from '$lib/core/logger';
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';
import type { AtomicAction } from '$lib/features/webrtc/transaction.type';
import { toast } from '$lib/shared/stores/toast.store.svelte';

// Index: fileId → roomId — cho phép flushProgressUpdates tra cứu O(1)
export const fileIndex = new Map<string, string>();

function getPeerId(msg: ChatMessage): string {
  return msg.peerId;
}

// Không còn revokeFileBlobUrl vì đã chuyển sang BlobCacheManager reference counting

async function restoreFileStates(msgs: ChatMessage[]) {
  // Khởi tạo trạng thái trắng cho các tệp
  for (const msg of msgs) {
    if (msg.type === 'file' && msg.file) {
      msg.file.isSending = false;
      msg.file.isReceiving = false;
      msg.file.url = undefined; // Quét sạch URL cũ mốc (vì URL của RAM phiên trước đã chết)
      msg.file.isPendingDownload = true;
      msg.file.progress = msg.file.progress === 100 ? 100 : 0;
    }
  }

  // Khôi phục URL từ đĩa cứng (Tránh đứt liên kết sau F5 cả bên Gửi lẫn bên Nhận)
  const fileMsgs = msgs.filter((m) => m.type === 'file' && m.file);
  await Promise.all(
    fileMsgs.map(async (msg) => {
      try {
        const hasBlob = await getFileBlobFromDB(msg.id);
        if (hasBlob && msg.file) {
          msg.file.url = undefined; // Components Sẽ tự gọi BlobCache để bốc URL
          msg.file.isPendingDownload = false; // Có blob trên đĩa cứng rồi
        }
      } catch (e) {
        log.dc.error(`[DB] Không thể phục hồi Blob state cho ${msg.id}`, e);
      }
    })
  );
}

export async function addMessage(msg: ChatMessage) {
  const m = ctx.messages;
  const peerId = getPeerId(msg);
  const roomMessages = m[peerId] || [];
  const existingIndex = roomMessages.findIndex((x) => x.id === msg.id);
  let updated: ChatMessage[];
  if (existingIndex !== -1) {
    updated = [...roomMessages];
    updated[existingIndex] = { ...updated[existingIndex], ...msg };
  } else {
    updated = [...roomMessages, msg];
    // CHỈ dọn RAM (nhằm test GC + tránh đơ máy) khi user KHÔNG phải đang Load More / Jump.
    if (!ctx.viewingHistoryForRoom[peerId] && updated.length > MAX_MESSAGE_HISTORY) {
      const trimmed = updated.slice(0, updated.length - MAX_MESSAGE_HISTORY);
      for (const old of trimmed) {
        if (old.type === 'file') {
          fileIndex.delete(old.id);
          ctx.outgoingFiles.delete(old.id);
        }
      }
      updated = updated.slice(-MAX_MESSAGE_HISTORY);
    }
  }

  // LƯU DB TRƯỚC THEO YÊU CẦU ĐẢM BẢO LOGIC
  const finalMsg = updated.find((x) => x.id === msg.id);
  if (finalMsg) {
    await saveMessageToDB(finalMsg);
  }

  // Sau khi lưu DB xong, cập nhật State để UI render nếu KHÔNG phải đang bật mảng lịch sử trôi
  if (msg.type === 'file') fileIndex.set(msg.id, peerId);
  const isViewingHistory = ctx.viewingHistoryForRoom[peerId];
  if (!isViewingHistory) {
    ctx.messages = { ...m, [peerId]: updated };
  } else {
    // Nếu đang xem lịch sử mà có tin nhắn mới (của user mình hoặc bạn đến), thẻ Unread sẽ lo hiện lên
    log.dc.info(`[HISTORY] Skipped rendering newest message ${msg.id} to avoid jumping history.`);
  }
}

export async function loadAllHistoryFromDB() {
  try {
    const allMsgs = await db.messages.orderBy('timestamp').toArray();
    const nextState: Record<string, ChatMessage[]> = {};
    for (const msg of allMsgs) {
      const peerId = getPeerId(msg);
      if (!nextState[peerId]) {
        nextState[peerId] = [];
      }
      nextState[peerId].push(msg);
    }

    // Trim to MAX_MESSAGE_HISTORY and populate fileIndex
    for (const peerId in nextState) {
      if (nextState[peerId].length > MAX_MESSAGE_HISTORY) {
        nextState[peerId] = nextState[peerId].slice(-MAX_MESSAGE_HISTORY);
      }
      for (const msg of nextState[peerId]) {
        if (msg.type === 'file') {
          fileIndex.set(msg.id, peerId);
        }
      }
    }

    await Promise.all(Object.values(nextState).map((msgs) => restoreFileStates(msgs)));

    ctx.messages = nextState;
  } catch (err) {
    log.db.error('Lỗi nạp lịch sử máy khách:', err);
    throw new Error(`Không thể nạp lịch sử`, { cause: err });
  }
}

/** Tải 100 tin nhắn xung quanh tin nhắn cũ được chọn (Jump to message) */
export async function loadHistoryAroundMessage(messageId: string, peerId: string) {
  try {
    const targetMsg = await db.messages.get(messageId);
    if (!targetMsg) return false;

    const timestamp = targetMsg.timestamp;

    // Tìm ~50 tin nhắn liền trước
    const beforeMsgs = await db.messages
      .where('[peerId+timestamp]')
      .between([peerId, Dexie.minKey], [peerId, timestamp], false, false)
      .reverse()
      .limit(MESSAGES_CHUNK_SIZE)
      .toArray();

    // Tìm ~50 tin nhắn liền sau (chặn trùng timestamp chính targetMsg nếu có)
    const afterMsgs = await db.messages
      .where('[peerId+timestamp]')
      .between([peerId, timestamp], [peerId, Dexie.maxKey], true, false)
      .limit(MESSAGES_CHUNK_SIZE)
      .toArray();

    beforeMsgs.reverse(); // Lấy từ cũ đến mới
    const allSlices: ChatMessage[] = [...beforeMsgs, ...afterMsgs];
    await restoreFileStates(allSlices);

    // Cập nhật RAM State
    ctx.viewingHistoryForRoom[peerId] = true;
    ctx.messages = { ...ctx.messages, [peerId]: allSlices };
    return true;
  } catch (err) {
    log.db.error('Lỗi nạp lịch sử quanh tin nhắn:', err);
    throw new Error(`Chỉ tải được một phần lịch sử`, { cause: err });
  }
}

/** Tải thêm tin nhắn cũ hơn vào đầu mảng (Infinite Scroll Ups) */
export async function loadOlderMessages(peerId: string) {
  try {
    const m = ctx.messages[peerId] || [];
    if (m.length === 0) return 0;

    const oldestTimestamp = m[0].timestamp;

    // Tìm ~50 tin nhắn liền trước mốc oldestTimestamp
    const olderMsgs = await db.messages
      .where('[peerId+timestamp]')
      .between([peerId, Dexie.minKey], [peerId, oldestTimestamp], false, false)
      .reverse()
      .limit(MESSAGES_CHUNK_SIZE)
      .toArray();

    if (olderMsgs.length === 0) return 0;

    olderMsgs.reverse(); // Lấy từ cũ đến mới
    await restoreFileStates(olderMsgs);

    ctx.viewingHistoryForRoom[peerId] = true;
    ctx.messages = { ...ctx.messages, [peerId]: [...olderMsgs, ...m] as ChatMessage[] };
    return olderMsgs.length;
  } catch (err) {
    log.db.error('Lỗi nạp lịch sử cũ:', err);
    throw new Error(`Lỗi nạp lịch sử cũ`, { cause: err });
  }
}

/** Hủy xem lịch sử, bóp lại 500 tin nhắn mới nhất như ban bình thường */
export async function resetToPresent(peerId: string) {
  try {
    const msgs = await db.messages
      .where('[peerId+timestamp]')
      .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
      .reverse()
      .limit(MAX_MESSAGE_HISTORY)
      .toArray();

    msgs.reverse();
    await restoreFileStates(msgs);

    ctx.viewingHistoryForRoom[peerId] = false;
    ctx.messages = { ...ctx.messages, [peerId]: msgs } as Record<string, ChatMessage[]>;
  } catch (e) {
    log.db.error('Lỗi trở về hiện tại:', e);
    throw new Error(`Lỗi tải tin nhắn mới nhất`, { cause: e });
  }
}

export async function addMessagesBatch(msgs: ChatMessage[]) {
  const m = ctx.messages;
  const nextState: Record<string, ChatMessage[]> = { ...m };
  const myId = ctx.currentUser?.id;

  for (const msg of msgs) {
    let processMsg: ChatMessage = { ...msg };
    processMsg.isSelf = myId ? processMsg.senderId === myId : processMsg.isSelf;
    if (processMsg.type === 'file' && processMsg.file) {
      processMsg = {
        ...processMsg,
        file: {
          ...processMsg.file,
          url: undefined,
          isExpired: false,
          isSending: false,
          isReceiving: false,
          isPendingDownload: true,
          progress: 0
        }
      };
    }

    const peerId = getPeerId(processMsg);
    // Svelte 5: Alway clone the array reference so derived state catches the update
    if (nextState[peerId] === m[peerId]) {
      nextState[peerId] = m[peerId] ? [...m[peerId]] : [];
    }

    const existingIndex = nextState[peerId].findIndex((x) => x.id === processMsg.id);
    if (existingIndex === -1) {
      nextState[peerId].push(processMsg);
      // Ghi nhớ peerId cho file messages để flushProgressUpdates tra O(1)
      if (processMsg.type === 'file') fileIndex.set(processMsg.id, peerId);
    }
  }

  // Sort history
  for (const peerId in nextState) {
    if (nextState[peerId] !== m[peerId]) {
      nextState[peerId] = [...nextState[peerId]].sort((a, b) => a.timestamp - b.timestamp);

      if (!ctx.viewingHistoryForRoom[peerId] && nextState[peerId].length > MAX_MESSAGE_HISTORY) {
        // Dọn fileIndex cho các file messages bị cắt ra khỏi lịch sử
        const trimmed = nextState[peerId].slice(0, nextState[peerId].length - MAX_MESSAGE_HISTORY);
        for (const old of trimmed) {
          if (old.type === 'file') {
            fileIndex.delete(old.id);
            ctx.outgoingFiles.delete(old.id);
          }
        }
        nextState[peerId] = nextState[peerId].slice(-MAX_MESSAGE_HISTORY);
      }
    }
  }

  ctx.messages = nextState;

  // Sync batch to Dexie
  const allUpserts: ChatMessage[] = [];
  for (const [, msgsArray] of Object.entries(nextState)) {
    const toSave: ChatMessage[] = msgsArray.filter((x) => msgs.some((m) => m.id === x.id));
    allUpserts.push(...toSave);
  }
  if (allUpserts.length > 0) {
    await db.messages
      .bulkPut(
        allUpserts.map((msg) => {
          // Create a safe copy for IndexedDB (similar to saveMessageToDB)
          const msgForDB: StoredChatMessage = {
            ...msg,
            peerId: getPeerId(msg)
          };

          // Handle file objects specially to ensure serializability
          if (msg.file) {
            msgForDB.file = {
              name: msg.file.name,
              size: msg.file.size,
              mimeType: msg.file.mimeType,
              url: msg.file.url,
              progress: msg.file.progress,
              isReceiving: msg.file.isReceiving,
              isSending: msg.file.isSending,
              isPendingDownload: msg.file.isPendingDownload,
              isExpired: msg.file.isExpired,
              error: msg.file.error,
              transferRate: msg.file.transferRate
            };
          }

          return msgForDB;
        })
      )
      .catch((e) => log.db.error('Lỗi bulkPut:', e));
  }
}

export const SendChatParamsSchema = z.object({
  text: z.string().optional(),
  type: z.enum(['text', 'system']).optional(),
  systemEvent: SystemEventSchema.optional(),
  peerId: z.string(),
  replyToId: z.string().optional(),
  replyPreview: z.string().optional()
});
export type SendChatParams = z.infer<typeof SendChatParamsSchema>;

export async function sendChat(params: SendChatParams) {
  const { text, type = 'text', systemEvent, peerId, replyToId, replyPreview } = params;
  if (!ctx.currentUser) return;

  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    senderId: ctx.currentUser.id,
    senderName: ctx.currentUser.name,
    peerId,
    text,
    timestamp: Date.now(),
    isSelf: true,
    isPending: true,
    type,
    systemEvent,
    replyToId,
    replyPreview
  };

  // Save message locally first - UI shows immediately
  await addMessage(msg);

  // Use atomic transaction for network delivery with retry support
  const action: AtomicAction = {
    type: 'chat',
    messageId: msg.id,
    peerId,
    message: msg
  };

  // No optimisticUpdate needed - message already saved locally
  // If network fails, will retry via outbox
  await atomicActionManager.executeAtomicAction(action);
}

export function sendTyping(isTyping: boolean, peerId: string) {
  if (!ctx.currentUser) return;
  sendToPeer(peerId, { type: 'typing', peerId: ctx.currentUser.id, isTyping });
}

/** Item 11.1 — Refactored: sử dụng atomic transaction thay vì gửi trực tiếp */
export async function editMessage(messageId: string, newText: string, peerId: string) {
  if (!ctx.currentUser) return;

  const action: AtomicAction = { type: 'edit', messageId, peerId, newText };

  const result = await atomicActionManager.executeAtomicAction(action, () => {
    // Optimistic UI update
    const m = ctx.messages;
    const roomMsgs = m[peerId] || [];
    const idx = roomMsgs.findIndex((x) => x.id === messageId);
    if (idx !== -1) {
      const updated: ChatMessage[] = [...roomMsgs];
      updated[idx] = { ...updated[idx], text: newText, isEdited: true, updatedAt: Date.now() };
      ctx.messages = { ...m, [peerId]: updated };
    }
  });

  if (!result.success) {
    toast.error(`Không thể sửa tin nhắn: ${result.error}`);
  }
}

export function sendReadReceipt(messageId: string, peerId: string) {
  if (!ctx.currentUser) return;
  sendToPeer(peerId, { type: 'message_read', messageId, peerId });
}

export function sendReadReceiptBatch(messageIds: string[], peerId: string) {
  if (!ctx.currentUser || messageIds.length === 0) return;
  if (messageIds.length === 1) {
    // Không tạo overhead wrapper cho trường hợp 1 tin nhắn
    sendToPeer(peerId, { type: 'message_read', messageId: messageIds[0], peerId });
  } else {
    sendToPeer(peerId, { type: 'message_read_batch', messageIds, peerId });
  }
}

export async function pinMessage(
  messageId: string,
  isPinned: boolean,
  peerId: string
): Promise<void> {
  if (!ctx.currentUser) return;

  const action: AtomicAction = {
    type: 'pin',
    messageId,
    peerId,
    isPinned
  };

  const result = await atomicActionManager.executeAtomicAction(action, () => {
    const m = ctx.messages;
    const roomMsgs = m[peerId] || [];
    const idx = roomMsgs.findIndex((x) => x.id === messageId);
    if (idx !== -1) {
      const updated: ChatMessage[] = [...roomMsgs];
      updated[idx] = { ...updated[idx], isPinned, updatedAt: Date.now() };
      ctx.messages = { ...m, [peerId]: updated as ChatMessage[] };
    }
  });

  if (!result.success) {
    toast.error(`Không thể ${isPinned ? 'ghim' : 'bỏ ghim'} tin nhắn: ${result.error}`);
  }
}

/** Item 11.2 — Refactored: sử dụng atomic transaction thay vì gửi trực tiếp */
export async function deleteMessage(messageId: string, peerId: string, syncGlobal: boolean = true) {
  if (!ctx.currentUser) return;

  const action: AtomicAction = { type: 'delete', messageId, peerId, syncGlobal };

  const result = await atomicActionManager.executeAtomicAction(action, () => {
    // Optimistic UI update
    const m = ctx.messages;
    const roomMsgs = m[peerId];
    if (!roomMsgs) return;
    const idx = roomMsgs.findIndex((x) => x.id === messageId);
    if (idx === -1) return;

    const updated: ChatMessage[] = [...roomMsgs];
    if (syncGlobal) {
      updated[idx] = {
        ...updated[idx],
        isDeleted: true,
        text: undefined,
        file: undefined,
        replyPreview: undefined,
        updatedAt: Date.now()
      };
      // Cleanup file RAM & blob on sync-global delete
      if (roomMsgs[idx].type === 'file' && !roomMsgs[idx].isDeleted) {
        fileIndex.delete(messageId);
        ctx.outgoingFiles.delete(messageId);
        deleteFileBlobFromDB(messageId);
      }
    } else {
      updated[idx] = {
        ...updated[idx],
        hiddenFromPeers: [...(updated[idx].hiddenFromPeers || []), ctx.currentUser!.id],
        updatedAt: Date.now()
      };
    }
    ctx.messages = { ...m, [peerId]: updated };
  });

  if (!result.success) {
    toast.error(`Không thể xóa tin nhắn: ${result.error}`);
  }
}

/** Item 11.3 — Refactored: sử dụng atomic transaction thay vì gửi trực tiếp */
export async function reactMessage(messageId: string, reaction: string, peerId: string) {
  if (!ctx.currentUser) return;

  const action: AtomicAction = { type: 'react', messageId, peerId, reaction };

  const result = await atomicActionManager.executeAtomicAction(action, () => {
    // Optimistic UI update
    const m = ctx.messages;
    const roomMsgs = m[peerId] || [];
    const idx = roomMsgs.findIndex((x) => x.id === messageId);
    if (idx !== -1) {
      const reactions: Record<string, string> = { ...(roomMsgs[idx].reactions || {}) };
      if (reaction) {
        if (reactions[ctx.currentUser!.id] === reaction) {
          delete reactions[ctx.currentUser!.id]; // Toggle off
        } else {
          reactions[ctx.currentUser!.id] = reaction;
        }
      } else {
        delete reactions[ctx.currentUser!.id];
      }
      const updated: ChatMessage[] = [...roomMsgs];
      updated[idx] = { ...updated[idx], reactions, updatedAt: Date.now() };
      ctx.messages = { ...m, [peerId]: updated as ChatMessage[] };
    }
  });

  if (!result.success) {
    toast.error(`Không thể thả reaction: ${result.error}`);
  }
}
