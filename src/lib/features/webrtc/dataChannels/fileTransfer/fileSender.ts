import type { ChatMessage, FileTransferMeta } from '$lib/type';
import {
  FILE_CHUNK_SIZE,
  MAX_WEBRTC_BUFFER,
  IN_FLIGHT_LIMIT
} from '$lib/features/webrtc/webrtc.constant';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { addMessage } from '$lib/features/webrtc/dataChannels/messageChannel';
import { readSliceAsArrayBuffer } from '$lib/features/webrtc/dataChannels/fileTransfer/fileReader';
import { log } from '$lib/core/logger';
import { db, getFileBlobFromDB, saveFileBlobToDB } from '$lib/core/db';
import { blobCache } from '$lib/core/blobCache';
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';
import type { AtomicAction } from '$lib/features/webrtc/transaction.type';

const TEXT_ENCODER = new TextEncoder();

export async function sendFile(file: File, peerId: string, caption?: string) {
  if (!ctx.currentUser) return;

  const fileId = crypto.randomUUID();
  const timestamp = Date.now();
  const meta: FileTransferMeta = {
    id: fileId,
    senderId: ctx.currentUser.id,
    name: file.name,
    size: file.size,
    mimeType: file.type,
    totalChunks: 0, // Sẽ được gán sau khi đọc
    timestamp, // required for schema
    caption
  };

  const msg: ChatMessage = {
    id: fileId,
    senderId: ctx.currentUser.id,
    senderName: ctx.currentUser.name,
    peerId,
    timestamp,
    isSelf: true,
    type: 'file',
    text: caption,
    file: {
      name: file.name,
      size: file.size,
      mimeType: file.type,
      progress: 0,
      isSending: false,
      url: blobCache.register(fileId, file)
    }
  };
  await addMessage(msg);

  // Quan trọng: Lưu trực tiếp Blob của người gửi vào đĩa cứng luôn để chống F5 mất ảnh
  await saveFileBlobToDB(fileId, file);

  meta.totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);

  const targetPeers = new Set<string>();
  const channel = ctx.dataChannels.get(peerId);
  if (channel && channel.readyState === 'open') {
    targetPeers.add(peerId);
  }

  ctx.outgoingFiles.set(fileId, {
    file,
    meta,
    chunks: [],
    ackedChunks: new Set(),
    peerAcked: new Map(),
    targetPeers
  });

  // Use atomic transaction for file meta signal with retry support
  const action: AtomicAction = {
    type: 'file',
    messageId: fileId,
    peerId,
    fileId,
    meta: {
      id: meta.id,
      senderId: meta.senderId,
      name: meta.name,
      size: meta.size,
      mimeType: meta.mimeType,
      totalChunks: meta.totalChunks,
      timestamp: meta.timestamp!,
      caption: meta.caption
    }
  };

  // No optimisticUpdate - message already saved locally
  // If network fails, will retry via outbox processor
  await atomicActionManager.executeAtomicAction(action);
}

export async function ensureOutgoingFile(fileId: string): Promise<boolean> {
  const outgoing = ctx.outgoingFiles.get(fileId);
  if (outgoing && outgoing.file) return true;

  // Lấy trực tiếp thông tin meta từ IndexedDB, không quét qua RAM O(N) nữa
  let msg: ChatMessage | undefined;
  try {
    const dbMsg = await db.messages.get(fileId);
    if (dbMsg) msg = dbMsg;
  } catch (e: unknown) {
    log.dc.warn('[DB] Lỗi khi get file metadata từ DB', e);
  }

  if (!msg || !msg.file) return false;

  const fileBlob = await getFileBlobFromDB(fileId);
  if (!fileBlob) return false;

  const fileObj = new File([fileBlob], msg.file.name, {
    type: msg.file.mimeType
  });

  const meta: FileTransferMeta = {
    id: fileId,
    senderId: msg.senderId,
    name: msg.file.name,
    size: msg.file.size,
    mimeType: msg.file.mimeType,
    totalChunks: Math.ceil(msg.file.size / FILE_CHUNK_SIZE),
    timestamp: msg.timestamp
  };

  ctx.outgoingFiles.set(fileId, {
    file: fileObj,
    meta,
    chunks: [],
    ackedChunks: new Set(),
    peerAcked: new Map(),
    targetPeers: new Set()
  });

  return true;
}

export async function sendChunksToSinglePeer(fileId: string, targetPeerId: string) {
  const outgoing = ctx.outgoingFiles.get(fileId);
  if (!outgoing) return;

  const file = outgoing.file;
  if (!file) return;

  const encodedFileId = TEXT_ENCODER.encode(fileId);
  const inFlightLimit = IN_FLIGHT_LIMIT;
  let lastYield = Date.now();

  // Prefetch pipeline — đọc trước N chunks song song với gửi, overlap I/O và network
  const PREFETCH_COUNT = 4;
  const prefetchedChunks = new Map<number, Promise<ArrayBuffer>>();
  const total = outgoing.meta.totalChunks;
  for (let p = 0; p < Math.min(PREFETCH_COUNT, total); p++) {
    prefetchedChunks.set(p, readSliceAsArrayBuffer(file, p));
  }

  for (let i = 0; i < total; i++) {
    if (outgoing.isCancelled) break;

    // Lấy chunk đã prefetch sẵn hoặc đọc mới nếu chưa có
    const chunkArrayBuffer = await (prefetchedChunks.get(i) || readSliceAsArrayBuffer(file, i));
    prefetchedChunks.delete(i);

    // Trigger prefetch chunk tiếp theo ngay lập tức
    const nextIdx = i + PREFETCH_COUNT;
    if (nextIdx < total) {
      prefetchedChunks.set(nextIdx, readSliceAsArrayBuffer(file, nextIdx));
    }

    // Backpressure — event-driven thay vì polling setTimeout
    let waiting = true;
    while (waiting && !outgoing.isCancelled) {
      const channel = ctx.dataChannels.get(targetPeerId);
      if (!channel || channel.readyState !== 'open') break;

      const ackSet = outgoing.peerAcked.get(targetPeerId);
      const ackedCount = ackSet ? ackSet.size : 0;

      const currentBuffer = channel.bufferedAmount;

      if (currentBuffer > MAX_WEBRTC_BUFFER) {
        // Buffer đầy — chờ event-driven native drain
        await waitForBufferDrain(new Set([targetPeerId]));
      } else if (i - ackedCount >= inFlightLimit) {
        // Quá nhiều chunks chưa được ACK — yield và thử lại sau 1 tick
        // Dùng setTimeout(0) thay vì setTimeout(10) để nhường event loop
        // mà không bị clamp 4ms của Chromium minimum timer
        await new Promise((r) => setTimeout(r, 0));
      } else {
        waiting = false;
      }
    }

    if (outgoing.isCancelled) break;

    const channel = ctx.dataChannels.get(targetPeerId);
    if (!channel || channel.readyState !== 'open') break;

    try {
      const payloadBytes = new Uint8Array(40 + chunkArrayBuffer.byteLength);
      payloadBytes.set(encodedFileId, 0);
      new DataView(payloadBytes.buffer).setUint32(36, i, true);
      payloadBytes.set(new Uint8Array(chunkArrayBuffer), 40);
      channel.send(payloadBytes.buffer);
    } catch (e) {
      log.dc.error(`Lỗi gửi chunk ${i} cho file ${fileId}, retry trong 100ms`, e);
      await new Promise((r) => setTimeout(r, 100));
      i--; // Retry chunk này
      continue;
    }

    // Yield control cho event loop (nhường UI) chỉ khi đã ngốn CPU quá 16ms (chuẩn 60fps)
    if (Date.now() - lastYield > 15) {
      await new Promise((r) => setTimeout(r, 0));
      lastYield = Date.now();
    }
  }
}

// ========================
// BUFFER DRAIN — Dùng native onbufferedamountlow thay polling setTimeout(1) bị clamp 4ms
// ========================
export function waitForBufferDrain(targetPeers: Set<string>): Promise<void> {
  let maxChannel: RTCDataChannel | null = null;
  let maxBuffer = 0;
  ctx.dataChannels.forEach((channel, peerId) => {
    if (!targetPeers.has(peerId)) return;
    if (channel.readyState === 'open' && channel.bufferedAmount > maxBuffer) {
      maxBuffer = channel.bufferedAmount;
      maxChannel = channel;
    }
  });

  if (!maxChannel || maxBuffer <= MAX_WEBRTC_BUFFER) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const ch = maxChannel!;
    ch.bufferedAmountLowThreshold = MAX_WEBRTC_BUFFER / 2;
    const prevHandler = ch.onbufferedamountlow;
    ch.onbufferedamountlow = () => {
      ch.onbufferedamountlow = prevHandler;
      resolve();
    };
    // Fallback timeout phòng kẹt
    setTimeout(() => {
      if (ch.onbufferedamountlow !== prevHandler) {
        ch.onbufferedamountlow = prevHandler;
        resolve();
      }
    }, 500);
  });
}
