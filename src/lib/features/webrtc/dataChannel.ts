import type { DataChannelPayload } from '$lib/features/chat/types/chat.type';
import { DataChannelPayloadSchema } from '$lib/features/chat/types/chat.type';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import {
  ACK_MAGIC_BYTE,
  SYNC_BATCH_SIZE,
  AUTO_DOWNLOAD_MAX_SIZE,
  KEEP_ALIVE_INTERVAL_MS,
  MAX_WEBRTC_BUFFER,
  STALE_TRANSFER_TIMEOUT_MS,
  STALE_TRANSFER_SWEEP_MS
} from '$lib/features/webrtc/webrtc.constant';
import { log } from '$lib/core/logger';
import { updatePeerStatus } from '$lib/features/webrtc/peer';
import { resetCallState } from '$lib/features/webrtc/peerConnection';
import { toast } from '$lib/shared/stores/toast.store.svelte';
import { i18n } from '$lib/features/i18n/i18n.store.svelte';
import {
  sendChat,
  addMessage,
  addMessagesBatch
} from '$lib/features/webrtc/dataChannels/messageChannel';
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';
import Dexie from 'dexie';
import { db, saveMessageToDB, deleteFileBlobFromDB, loadMessagesForPeerFromDB } from '$lib/core/db';
import {
  handleBinaryAckBatch,
  handleBinaryFileChunk,
  sendChunksToSinglePeer,
  readSliceAsArrayBuffer,
  updateMessageFileState,
  processFileAcks,
  requestDownload,
  cancelDownload,
  sendFile,
  waitForBufferDrain,
  ensureOutgoingFile
} from '$lib/features/webrtc/dataChannels/fileTransfer';

export * from '$lib/features/webrtc/dataChannels/fileTransfer';

// ========================
// STALE TRANSFER SWEEP
// ========================

// Timer module-level — chỉ chạy khi có ít nhất 1 DataChannel đang mở
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function sweepStaleTransfers() {
  const now = Date.now();

  // Dọn incoming transfers bị stall (đang nhận nhưng không có progress quá lâu)
  for (const [fileId, incoming] of ctx.incomingFiles.entries()) {
    // Bỏ qua file chưa bắt đầu nhận (user chưa bấm download)
    if (incoming.isPendingDownload) continue;

    const lastUpdate = incoming.lastProgressUpdate ?? 0;
    if (now - lastUpdate < STALE_TRANSFER_TIMEOUT_MS) continue;

    log.dc.warn(
      `[STALE] Incoming "${incoming.meta.name}" không có tiến độ sau ${STALE_TRANSFER_TIMEOUT_MS / 60000}m — dọn dẹp`
    );
    ctx.incomingFiles.delete(fileId);
    updateMessageFileState(fileId, { isReceiving: false, isExpired: true });
  }

  // Dọn outgoing transfers bị stall (peer đã bắt đầu nhận nhưng không ACK quá lâu)
  for (const outgoing of ctx.outgoingFiles.values()) {
    // Bỏ qua nếu chưa có peer nào bắt đầu nhận, hoặc đã cancel
    if (!outgoing.downloadRequestedPeers?.size || outgoing.isCancelled) continue;

    const lastUpdate = outgoing.lastAckProgressUpdate ?? outgoing.lastRateUpdate ?? 0;
    // lastUpdate === 0: peer request nhưng chưa bao giờ gửi ACK đầu tiên
    if (lastUpdate > 0 && now - lastUpdate < STALE_TRANSFER_TIMEOUT_MS) continue;

    log.dc.warn(
      `[STALE] Outgoing "${outgoing.meta.name}" không có ACK sau ${STALE_TRANSFER_TIMEOUT_MS / 60000}m — reset để peer retry`
    );
    // Không xóa entry — giữ file để re-serve khi peer gửi lại file_download_req
    outgoing.downloadRequestedPeers = new Set();
    outgoing.lastAckProgressUpdate = undefined;
    outgoing.lastRateUpdate = undefined;
    updateMessageFileState(outgoing.meta.id, { isSending: false, error: undefined });
  }
}

function startSweepIfNeeded() {
  if (sweepTimer !== null) return;
  sweepTimer = setInterval(sweepStaleTransfers, STALE_TRANSFER_SWEEP_MS);
}

function stopSweepIfIdle() {
  // Còn DataChannel nào đang mở thì giữ sweep chạy
  if (ctx.dataChannels.size > 0) return;
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

const isAutoDownloadableMedia = (mimeType?: string, size: number = 0) => {
  if (!mimeType) return false;
  const isMedia = /^(image|video|audio)\//.test(mimeType);
  return isMedia && size < AUTO_DOWNLOAD_MAX_SIZE;
};

// --- Hàm sync thủ công gọi từ UI ---
export function syncMessages(peerId: string) {
  const channel = ctx.dataChannels.get(peerId);
  if (!channel) return;

  const doSync = async () => {
    try {
      // Lấy trực tiếp từ DB để tránh rủi ro RAM chưa nạp kịp lúc WebRTC mở
      const dbMessages = await loadMessagesForPeerFromDB(peerId);
      const latestTimestamp = dbMessages.at(-1)?.timestamp ?? 0;
      channel.send(
        JSON.stringify({ type: 'sync_ready', count: dbMessages.length, latestTimestamp })
      );
      log.dc.info(
        `[SYNC] Gửi on-demand sync_ready count=${dbMessages.length}, time=${latestTimestamp}`
      );
    } catch (e: unknown) {
      log.dc.error('[SYNC] Lỗi gửi sync_ready:', e);
    }
  };

  if (channel.readyState === 'open') {
    doSync();
  } else if (channel.readyState !== 'closed') {
    const onOpen = () => {
      doSync();
      channel.removeEventListener('open', onOpen);
      channel.removeEventListener('close', onCleanup);
      channel.removeEventListener('error', onCleanup);
    };
    const onCleanup = () => {
      channel.removeEventListener('open', onOpen);
      channel.removeEventListener('close', onCleanup);
      channel.removeEventListener('error', onCleanup);
    };
    channel.addEventListener('open', onOpen);
    channel.addEventListener('close', onCleanup);
    channel.addEventListener('error', onCleanup);
  }
}

export {
  sendChat,
  type SendChatParams,
  sendTyping,
  editMessage,
  deleteMessage,
  reactMessage,
  sendReadReceipt,
  sendReadReceiptBatch,
  pinMessage
} from '$lib/features/webrtc/dataChannels/messageChannel';
export { requestDownload, cancelDownload, sendFile };

// ========================
// PAYLOAD HANDLERS — mỗi handler chịu trách nhiệm 1 loại payload
// ========================

export function handleSyncReady(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'sync_ready' }>
) {
  const channel = ctx.dataChannels.get(peerId);
  if (!channel || channel.readyState !== 'open') return;

  const remoteCount = payload.count;
  const latestRemoteTime = payload.latestTimestamp ?? 0;
  log.dc.info(`[SYNC] Remote reports count=${remoteCount}, latestTime=${latestRemoteTime}`);

  // Bước 1: Xả Outbox (Nhật ký thao tác bù giờ - Sửa/Xoá)
  atomicActionManager
    .processOutboxForPeer(peerId)
    .catch((e) => log.dc.error('[SYNC] Lỗi xả outbox:', e));

  // Bước 2: Cursor-based DB Sync (Lọc dữ liệu chưa từng gửi)
  (async () => {
    try {
      // Lọc khuyết thiếu: Chỉ lấy tin nhắn (Add) sinh ra SAU mốc thời gian của máy B
      // includeLower: false → chỉ lấy timestamp > latestRemoteTime (không bao gồm bằng)
      const missingMessages = await db.messages
        .where('[peerId+timestamp]')
        .between([peerId, latestRemoteTime], [peerId, Dexie.maxKey], false, false)
        .toArray();

      if (missingMessages.length > 0) {
        log.dc.info(`[SYNC] Gửi ${missingMessages.length} tin mới bị thiếu tới peer ${peerId}`);
        for (let i = 0; i < missingMessages.length; i += SYNC_BATCH_SIZE) {
          if (channel.readyState !== 'open') break;
          const batch = missingMessages.slice(i, i + SYNC_BATCH_SIZE);
          channel.send(JSON.stringify({ type: 'sync_data', messages: batch }));
          await new Promise((r) => setTimeout(r, 10)); // Throttling
        }
      } else {
        log.dc.info(`[SYNC] Không có tin nhắn mới nào cần State Sync với ${peerId}.`);
      }
    } catch (e: unknown) {
      log.dc.error('[SYNC] Lỗi truy xuất DB trong sync_ready:', e);
    }
  })().catch((e: unknown) => log.dc.error('[SYNC] Unhandled error trong sync pipeline:', e));
}

export async function handleSyncData(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'sync_data' }>
) {
  log.dc.info(`[SYNC] Nhận ${payload.messages.length} tin nhắn bị thiếu. Đang nạp bổ sung...`);

  // Phải sửa lại peerId của tin nhắn nhận được theo góc nhìn của người nhận (là peerId người gửi)
  const processedMessages = payload.messages.map((msg) => ({
    ...msg,
    peerId: peerId,
    isSelf: msg.senderId === ctx.currentUser?.id
  }));

  // Đợi lưu xong vào IndexedDB
  await addMessagesBatch(processedMessages);

  // Ảnh/Video < 10MB được sync về với isPendingDownload=true — tự động request để người dùng không cần bấm
  for (const msg of processedMessages) {
    if (msg.type === 'file' && isAutoDownloadableMedia(msg.file?.mimeType, msg.file?.size)) {
      try {
        log.dc.info(`[SYNC] Auto-requesting media download for file ${msg.id}`);
        await requestDownload(msg.id, peerId, msg, false);
        await new Promise((r) => setTimeout(r, 100)); // Tránh nghẽn buffer
      } catch (err) {
        log.dc.error(`[SYNC] Lỗi auto-request download cho file ${msg.id}:`, err);
      }
    }
  }
}

export async function handleFileMeta(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'file_meta' }>
) {
  const peer = ctx.peer;
  const peerName = peer.find((p) => p.id === peerId)?.name || 'Unknown';
  const autoDownloadMedia = isAutoDownloadableMedia(payload.meta.mimeType, payload.meta.size);

  // Lưu entry nhưng đánh dấu isPendingDownload — chưa bắt đầu nhận
  ctx.incomingFiles.set(payload.meta.id, {
    meta: payload.meta,
    chunks: [], // lazy-init: chỉ push khi fallback
    receivedChunks: new Set<number>(),
    senderPeerId: peerId,
    isPendingDownload: true,
    lastProgressUpdate: Date.now()
  });

  await addMessage({
    id: payload.meta.id,
    senderId: payload.meta.senderId,
    senderName: peerName,
    peerId: peerId,
    timestamp: payload.meta.timestamp || Date.now(),
    isSelf: false,
    type: 'file',
    text: payload.meta.caption,
    file: {
      name: payload.meta.name,
      size: payload.meta.size,
      mimeType: payload.meta.mimeType,
      progress: 0,
      isPendingDownload: !autoDownloadMedia, // Media < 10MB tự nhận, còn lại chờ user
      isReceiving: autoDownloadMedia
    }
  });

  // Media < 10MB tự động nhận ngay
  if (autoDownloadMedia) {
    requestDownload(payload.meta.id, peerId);
  }
}

export async function handleFileRequest(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'file_request' }>
) {
  const ready = await ensureOutgoingFile(payload.id);
  if (!ready) return;

  const outgoing = ctx.outgoingFiles.get(payload.id);
  if (outgoing && outgoing.file && !outgoing.isCancelled) {
    log.dc.info(`Nhận yêu cầu re-transmit ${payload.chunkIndices.length} chunks từ ${peerId}`);
    const encodedId = new TextEncoder().encode(payload.id);
    // Gửi tuần tự có kiểm tra buffer — tránh pump hàng trăm disk reads song song
    (async () => {
      for (const idx of payload.chunkIndices) {
        const channel = ctx.dataChannels.get(peerId);
        if (!channel || channel.readyState !== 'open') break;
        if (channel.bufferedAmount > MAX_WEBRTC_BUFFER) {
          await waitForBufferDrain(new Set([peerId]));
        }
        try {
          const chunkArrayBuffer = await readSliceAsArrayBuffer(outgoing.file, idx);
          const payloadBytes = new Uint8Array(40 + chunkArrayBuffer.byteLength);
          payloadBytes.set(encodedId, 0);
          new DataView(payloadBytes.buffer).setUint32(36, idx, true);
          payloadBytes.set(new Uint8Array(chunkArrayBuffer), 40);
          const ch = ctx.dataChannels.get(peerId);
          if (ch && ch.readyState === 'open') {
            ch.send(payloadBytes.buffer);
          }
        } catch (e: unknown) {
          log.dc.error(`Lỗi re-transmit chunk ${idx} cho file ${payload.id}:`, e);
        }
      }
    })();
  }
}

export async function handleFileDownloadReq(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'file_download_req' }>
) {
  const ready = await ensureOutgoingFile(payload.id);
  if (!ready) {
    log.dc.warn(`Gửi file thất bại vì không thể phục hồi file từ IndexedDB: ${payload.id}`);
    return;
  }

  // Peer yêu cầu bắt đầu nhận file — sender bắt đầu stream cho peer đó
  const outgoing = ctx.outgoingFiles.get(payload.id);
  if (outgoing && !outgoing.isCancelled) {
    if (!outgoing.downloadRequestedPeers) outgoing.downloadRequestedPeers = new Set();
    // Cho phép peer request lại sau khi reconnect (xóa cờ cũ nếu có)
    outgoing.downloadRequestedPeers.delete(peerId);
    outgoing.downloadRequestedPeers.add(peerId);
    outgoing.targetPeers.add(peerId);

    // Reset state của peer này để re-download tính tiến độ đúng
    outgoing.peerAcked.get(peerId)?.clear();
    outgoing.lastRateUpdate = undefined;
    outgoing.lastAckProgressUpdate = undefined;

    log.dc.info(`Bắt đầu re-send file "${outgoing.meta.name}" cho ${peerId}`);
    // Reset trạng thái UI sender sang đang gửi
    updateMessageFileState(payload.id, { isSending: true, error: undefined });
    sendChunksToSinglePeer(payload.id, peerId);
  } else {
    log.dc.warn(`Gửi file thất bại vì outgoing không tồn tại hoặc isCancelled: ${payload.id}`);
  }
}

export function handleFileDownloadAbort(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'file_download_abort' }>
) {
  const outgoing = ctx.outgoingFiles.get(payload.id);
  if (outgoing) {
    log.dc.info(`Peer ${peerId} đã hủy nhận file "${outgoing.meta.name}"`);
    outgoing.downloadRequestedPeers?.delete(peerId);
    // Xóa acked chunks của peer này để lần sau nếu họ request lại thì download từ đầu
    outgoing.peerAcked.get(peerId)?.clear();

    if (!outgoing.downloadRequestedPeers || outgoing.downloadRequestedPeers.size === 0) {
      log.dc.info(`Không còn ai tải file "${outgoing.meta.name}", tạm dừng gửi.`);
      outgoing.lastRateUpdate = undefined;
      outgoing.lastAckProgressUpdate = undefined;
      // Cập nhật giao diện: Tắt isSending
      updateMessageFileState(payload.id, { isSending: false });
    }
  }
}

export async function handleChatPayload(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'chat' }>
) {
  payload.message.isSelf = false;
  payload.message.peerId = peerId;

  // Yêu cầu: lưu tin nhắn vào db TRƯỚC khi xử lý các logic khác
  await addMessage(payload.message);

  if (payload.message.type === 'system') {
    const event = payload.message.systemEvent;
    if (event === 'screenShareStop') {
      const newS = { ...ctx.remoteMediaStreams };
      delete newS[peerId];
      ctx.remoteMediaStreams = newS;
      log.webrtc.info(`Peer ${peerId} đã dừng chia sẻ màn hình.`);
    } else if (event === 'callOffer') {
      const isMediaActive =
        !!ctx.localMediaStream || Object.keys(ctx.remoteMediaStreams).length > 0;
      if (ctx.callState !== 'idle' || isMediaActive) {
        // Đang bận (gọi điện, hoặc đang stream, hoặc đang xem stream) — tự động từ chối
        log.webrtc.info(
          `Từ chối cuộc gọi từ ${peerId} vì đang bận (callState=${ctx.callState}, media=${isMediaActive})`
        );
        sendChat({ type: 'system', systemEvent: 'callBusy', peerId });
        return;
      }
      ctx.callState = 'ringing';
      ctx.callPeerId = peerId;
      ctx.callIsIncoming = true;
      ctx.callWithVideo = payload.message.text === 'video';
      log.webrtc.info(`Có cuộc gọi đến từ ${peerId}`);
    } else if (event === 'callBusy') {
      // Người nhận đang bận — thông báo cho caller và reset state
      log.webrtc.info(`Peer ${peerId} đang bận, hủy cuộc gọi`);
      toast.error(i18n.t('callBusyNotice'));
      resetCallState();
    } else if (event === 'callAccepted') {
      ctx.callState = 'in_call';
      log.webrtc.info(`Peer ${peerId} đã nhận cuộc gọi`);
    } else if (event === 'callDeclined') {
      log.webrtc.info(`Peer ${peerId} đã từ chối cuộc gọi`);
      resetCallState();
    } else if (event === 'callEnded') {
      log.webrtc.info(`Cuộc gọi từ ${peerId} đã kết thúc`);
      resetCallState();
    }
  }
}

export function handleTypingPayload(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'typing' }>
) {
  const typingSenderId = payload.peerId || peerId;
  const copy = new Map(ctx.typingUsers);
  if (payload.isTyping) {
    // Keep peer in the map with current timestamp
    copy.set(typingSenderId, Date.now());
  } else {
    copy.delete(typingSenderId);
  }
  for (const [k, v] of copy.entries()) {
    ctx.typingUsers.set(k, v);
  }
  for (const k of ctx.typingUsers.keys()) {
    if (!copy.has(k)) ctx.typingUsers.delete(k);
  }
}

export function handleMessageRead(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'message_read' }>
) {
  const m = ctx.messages;
  const targetRoomId = peerId;
  const roomMsgs = m[targetRoomId] || [];
  const idx = roomMsgs.findIndex((x) => x.id === payload.messageId);
  if (idx !== -1) {
    const nextRoomMsgs = [...roomMsgs];
    const msg = nextRoomMsgs[idx];
    if (!msg.read) {
      nextRoomMsgs[idx] = { ...msg, read: true, updatedAt: Date.now() };
      ctx.messages = { ...m, [targetRoomId]: nextRoomMsgs };
      saveMessageToDB(nextRoomMsgs[idx]);
    }
  }
}

export function handleMessageReadBatch(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'message_read_batch' }>
) {
  const m = ctx.messages;
  const targetRoomId = peerId;
  const roomMsgs = m[targetRoomId] || [];
  const idSet = new Set(payload.messageIds);
  let changed = false;
  const nextRoomMsgs = roomMsgs.map((msg) => {
    if (idSet.has(msg.id) && !msg.read) {
      changed = true;
      const updated = { ...msg, read: true, updatedAt: Date.now() };
      saveMessageToDB(updated);
      return updated;
    }
    return msg;
  });
  if (changed) {
    ctx.messages = { ...m, [targetRoomId]: nextRoomMsgs };
  }
}

export function handleMessageReact(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'message_react' }>
) {
  const m = ctx.messages;
  const targetRoomId = peerId;
  const roomMsgs = m[targetRoomId];

  if (!roomMsgs) return;

  const idx = roomMsgs.findIndex((x) => x.id === payload.messageId);
  if (idx !== -1) {
    const updatedRoomMsgs = [...roomMsgs];
    const msg = updatedRoomMsgs[idx];
    const reactions = { ...(msg.reactions || {}) };
    const remoteSenderId = peerId;

    if (payload.reaction) {
      if (reactions[remoteSenderId] === payload.reaction) {
        delete reactions[remoteSenderId];
      } else {
        reactions[remoteSenderId] = payload.reaction;
      }
    } else {
      delete reactions[remoteSenderId];
    }

    const updatedMsg = { ...msg, reactions, updatedAt: Date.now() };
    updatedRoomMsgs[idx] = updatedMsg;
    ctx.messages = { ...m, [targetRoomId]: updatedRoomMsgs };
    saveMessageToDB(updatedMsg);
  }
}

export function handleMessageHideLocal(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'message_hide_local' }>
) {
  const m = ctx.messages;
  const targetRoomId = peerId;
  const roomMsgs = m[targetRoomId];

  if (!roomMsgs) return;

  const idx = roomMsgs.findIndex((x) => x.id === payload.messageId);
  if (idx !== -1) {
    const updatedRoomMsgs = [...roomMsgs];
    const updatedMsg = {
      ...updatedRoomMsgs[idx],
      hiddenFromPeers: [...(updatedRoomMsgs[idx].hiddenFromPeers || []), peerId],
      updatedAt: Date.now()
    };
    updatedRoomMsgs[idx] = updatedMsg;
    ctx.messages = { ...m, [targetRoomId]: updatedRoomMsgs };
    saveMessageToDB(updatedMsg);
  }
}

export function handleMessageDelete(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'message_delete' }>
) {
  const m = ctx.messages;
  const targetRoomId = peerId;
  const roomMsgs = m[targetRoomId];

  if (!roomMsgs) return;

  const idx = roomMsgs.findIndex((x) => x.id === payload.messageId);
  if (idx !== -1) {
    const updatedRoomMsgs = [...roomMsgs];
    const updatedMsg = {
      ...updatedRoomMsgs[idx],
      isDeleted: true,
      text: undefined,
      file: undefined,
      replyPreview: undefined,
      updatedAt: Date.now()
    };
    updatedRoomMsgs[idx] = updatedMsg;
    ctx.messages = { ...m, [targetRoomId]: updatedRoomMsgs };
    saveMessageToDB(updatedMsg);
    if (updatedMsg.type === 'file') deleteFileBlobFromDB(payload.messageId);
  }
}

export function handleMessageEdit(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'message_edit' }>
) {
  const m = ctx.messages;
  const targetRoomId = peerId;
  const roomMsgs = m[targetRoomId];

  if (!roomMsgs) return;

  const idx = roomMsgs.findIndex((x) => x.id === payload.messageId);
  if (idx !== -1) {
    const updatedRoomMsgs = [...roomMsgs];
    const updatedMsg = {
      ...updatedRoomMsgs[idx],
      text: payload.newText,
      isEdited: true,
      updatedAt: Date.now()
    };
    updatedRoomMsgs[idx] = updatedMsg;
    ctx.messages = { ...m, [targetRoomId]: updatedRoomMsgs };
    saveMessageToDB(updatedMsg);
  }
}

export function handleMessagePin(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'message_pin' }>
) {
  const m = ctx.messages;
  const targetRoomId = peerId;
  const roomMsgs = m[targetRoomId];

  if (!roomMsgs) return;

  const idx = roomMsgs.findIndex((x) => x.id === payload.messageId);
  if (idx !== -1) {
    const updatedRoomMsgs = [...roomMsgs];
    const updatedMsg = {
      ...updatedRoomMsgs[idx],
      isPinned: payload.isPinned,
      updatedAt: Date.now()
    };
    updatedRoomMsgs[idx] = updatedMsg;
    ctx.messages = { ...m, [targetRoomId]: updatedRoomMsgs };
    saveMessageToDB(updatedMsg);
  }
}

export function handlePing(peerId: string) {
  const channel = ctx.dataChannels.get(peerId);
  if (channel && channel.readyState === 'open') {
    try {
      channel.send(JSON.stringify({ type: 'pong' }));
    } catch (e) {
      log.dc.warn('Lỗi gửi pong:', e);
    }
  }
}

function handleDataChannelMessage(peerId: string, payload: DataChannelPayload) {
  switch (payload.type) {
    case 'chat':
      handleChatPayload(peerId, payload);
      break;

    case 'typing':
      handleTypingPayload(peerId, payload);
      break;

    case 'message_read':
      handleMessageRead(peerId, payload);
      break;

    case 'message_read_batch':
      handleMessageReadBatch(peerId, payload);
      break;

    case 'message_react':
      handleMessageReact(peerId, payload);
      break;

    case 'message_hide_local':
      handleMessageHideLocal(peerId, payload);
      break;

    case 'message_delete':
      handleMessageDelete(peerId, payload);
      break;

    case 'message_edit':
      handleMessageEdit(peerId, payload);
      break;

    case 'message_pin':
      handleMessagePin(peerId, payload);
      break;

    case 'sync_ready':
      handleSyncReady(peerId, payload);
      break;

    case 'sync_data':
      handleSyncData(peerId, payload);
      break;

    case 'file_meta':
      handleFileMeta(peerId, payload);
      break;

    case 'file_ack':
      // Backward compat: JSON ACK đơn lẻ (từ client cũ hoặc fallback)
      processFileAcks(peerId, payload.id, [payload.chunkIndex]);
      break;

    case 'file_request':
      handleFileRequest(peerId, payload);
      break;

    case 'file_download_req':
      handleFileDownloadReq(peerId, payload);
      break;

    case 'file_download_abort':
      handleFileDownloadAbort(peerId, payload);
      break;

    case 'ping':
      handlePing(peerId);
      break;

    case 'pong':
      // Nhận pong (chỉ cần có luồng traffic là NAT không đóng)
      break;
  }
}

// ========================
// SETUP DATA CHANNEL
// ========================
export function setupDataChannel(peerId: string, dc: RTCDataChannel) {
  dc.binaryType = 'arraybuffer'; // Support native binary data
  ctx.dataChannels.set(peerId, dc);
  let pingInterval: ReturnType<typeof setInterval>;
  let hasOpened = false;

  const handleOpen = () => {
    if (hasOpened) return;
    hasOpened = true;

    log.dc.info(`Mở tuyến chat với ${peerId}`);
    const currentPeers = ctx.peer;
    const peerName = currentPeers.find((x) => x.id === peerId)?.name || 'Unknown';
    updatePeerStatus(peerId, peerName, true);
    startSweepIfNeeded();

    // Tự động kích hoạt luồng đồng bộ 1 LẦN DUY NHẤT ngay khi kênh WebRTC mở.
    // Loại trừ hiện tượng Svelte UI gửi spam sync command vì reactivity loop.
    syncMessages(peerId);

    // Keep-alive chống NAT Timeout
    pingInterval = setInterval(() => {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify({ type: 'ping' }));
        } catch (e: unknown) {
          log.dc.warn(`Ping failed to ${peerId}:`, e);
        }
      }
    }, KEEP_ALIVE_INTERVAL_MS);
  };

  dc.onopen = handleOpen;
  if (dc.readyState === 'open') {
    handleOpen();
  }
  dc.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      // Phân biệt binary file chunk vs binary ACK batch bằng magic byte đầu tiên
      const firstByte = new Uint8Array(e.data, 0, 1)[0];
      if (firstByte === ACK_MAGIC_BYTE) {
        handleBinaryAckBatch(peerId, e.data);
      } else {
        handleBinaryFileChunk(peerId, e.data);
      }
      return;
    }

    try {
      const parsed = JSON.parse(e.data);
      if (parsed.id && parsed.timestamp && !parsed.type) {
        // Fallback cho legacy client cũ không có wrapper payload
        const wrappedPayload = {
          type: 'chat',
          message: { ...parsed, isSelf: false, type: 'text' }
        };
        const legacyResult = DataChannelPayloadSchema.safeParse(wrappedPayload);
        if (legacyResult.success) {
          handleDataChannelMessage(peerId, legacyResult.data);
        } else {
          log.dc.warn('Legacy message không qua được validation:', legacyResult.error);
        }
        return;
      }

      const result = DataChannelPayloadSchema.safeParse(parsed);
      if (result.success) {
        handleDataChannelMessage(peerId, result.data);
      } else {
        log.dc.warn('Nhận message JSON định dạng sai:', result.error);
      }
    } catch (e: unknown) {
      log.dc.warn('Nhận message JSON không parse được:', e);
    }
  };
  dc.onclose = () => {
    clearInterval(pingInterval);
    ctx.dataChannels.delete(peerId);
    stopSweepIfIdle();

    // File offer của peer này chưa ai download → đánh dấu expired
    for (const [fileId, incoming] of ctx.incomingFiles.entries()) {
      if (incoming.senderPeerId === peerId && incoming.isPendingDownload) {
        incoming.isPendingDownload = false;
        updateMessageFileState(fileId, { isPendingDownload: false, isExpired: true });
        log.dc.warn(`File offer hết hạn (sender offline): ${incoming.meta.name}`);
        ctx.incomingFiles.delete(fileId);
      }
    }

    // 1-1 model: nếu recipient rớt mạng trong khi đang gửi file
    // Không xóa outgoingFiles — giữ file trong bộ nhớ để có thể gửi lại khi peer reconnect
    for (const [fileId, outgoing] of ctx.outgoingFiles.entries()) {
      if (!outgoing.targetPeers.has(peerId)) continue;
      log.dc.warn(
        `Recipient rớt mạng khi đang gửi file: ${outgoing.meta.name} — giữ lại để re-serve`
      );
      // Xóa peerId khỏi downloadRequestedPeers để peer có thể yêu cầu lại sau khi reconnect
      outgoing.downloadRequestedPeers?.delete(peerId);
      // Cập nhật UI về trạng thái chờ (không phải lỗi)
      updateMessageFileState(fileId, { isSending: false, error: undefined });
    }
  };
}
