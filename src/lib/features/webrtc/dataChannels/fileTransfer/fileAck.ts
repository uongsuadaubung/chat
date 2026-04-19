import type { ChatMessage } from '$lib/type';
import type { ProgressUpdate } from '$lib/features/webrtc/types/webrtc.type';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import {
  FILE_CHUNK_SIZE,
  ACK_MAGIC_BYTE,
  ACK_BATCH_INTERVAL_MS,
  FILE_ID_BYTES
} from '$lib/features/webrtc/webrtc.constant';
import { log } from '$lib/core/logger';
import { fileIndex } from '$lib/features/webrtc/dataChannels/messageChannel';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

// ========================
// PROGRESS STATE UPDATES
// ========================
const pendingProgressUpdates = new Map<string, ProgressUpdate>();
let rafScheduled = false;

export function flushProgressUpdates() {
  if (pendingProgressUpdates.size === 0) return;

  pendingProgressUpdates.forEach((update, fileId) => {
    // O(1) lookup thay vì duyệt toàn bộ store
    const roomId = fileIndex.get(fileId);
    if (!roomId || !ctx.messages[roomId]) return;

    const roomMessages = ctx.messages[roomId];
    const idx = roomMessages.findIndex((x) => x.id === fileId);
    if (idx === -1 || !roomMessages[idx].file) return;

    const copy = [...roomMessages];
    copy[idx] = {
      ...copy[idx],
      file: {
        ...copy[idx].file!,
        progress: update.progress,
        url: update.url || copy[idx].file!.url,
        isReceiving: update.complete || update.error ? false : copy[idx].file!.isReceiving,
        isSending: update.complete || update.error ? false : copy[idx].file!.isSending,
        error: update.error || copy[idx].file!.error,
        transferRate: update.rate !== undefined ? update.rate : copy[idx].file!.transferRate
      }
    };
    ctx.messages[roomId] = copy;
  });

  pendingProgressUpdates.clear();
}

export function updateMessageFileProgress(
  fileId: string,
  progress: number,
  url?: string,
  complete?: boolean,
  error?: string,
  rate?: number
) {
  pendingProgressUpdates.set(fileId, { progress, url, complete, error, rate });

  if (complete || error) {
    // Flush ngay lập tức cho completion/error — không delay
    flushProgressUpdates();
    rafScheduled = false;
  } else if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(() => {
      flushProgressUpdates();
      rafScheduled = false;
    });
  }
}

export function updateMessageFileState(fileId: string, stateUpdate: Partial<ChatMessage['file']>) {
  // O(1) lookup thay vì duyệt toàn bộ store
  const roomId = fileIndex.get(fileId);
  if (!roomId || !ctx.messages[roomId]) return;

  const roomMessages = ctx.messages[roomId];
  const idx = roomMessages.findIndex((x) => x.id === fileId);
  if (idx === -1 || !roomMessages[idx].file) return;

  const copy = [...roomMessages];
  copy[idx] = {
    ...copy[idx],
    file: {
      ...copy[idx].file!,
      ...stateUpdate
    }
  };
  ctx.messages[roomId] = copy;
}

// ========================
// ACK BATCH SYSTEM — Gom ACK nhỏ lẻ thành batch binary, giảm ~99% messages
// ========================
const pendingAcks = new Map<string, number[]>();
let ackFlushTimer: ReturnType<typeof setTimeout> | null = null;

export function queueAck(peerId: string, fileId: string, chunkIndex: number) {
  const key = `${peerId}\0${fileId}`;
  let list = pendingAcks.get(key);
  if (!list) {
    list = [];
    pendingAcks.set(key, list);
  }
  list.push(chunkIndex);

  if (!ackFlushTimer) {
    ackFlushTimer = setTimeout(() => {
      flushAcks();
      ackFlushTimer = null;
    }, ACK_BATCH_INTERVAL_MS);
  }
}

export function flushAcks() {
  if (ackFlushTimer) clearTimeout(ackFlushTimer);
  ackFlushTimer = null;
  pendingAcks.forEach((indices, key) => {
    const separatorIdx = key.indexOf('\0');
    const peerId = key.substring(0, separatorIdx);
    const fileId = key.substring(separatorIdx + 1);

    // Binary ACK format: [1 byte magic=0xAC][36 bytes fileId][4 bytes count][4 bytes × N indices]
    const ACK_HEADER_SIZE = 1 + FILE_ID_BYTES + 4;
    const buf = new ArrayBuffer(ACK_HEADER_SIZE + indices.length * 4);
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);

    bytes[0] = ACK_MAGIC_BYTE;
    bytes.set(TEXT_ENCODER.encode(fileId), 1);
    view.setUint32(1 + FILE_ID_BYTES, indices.length, true);
    for (let j = 0; j < indices.length; j++) {
      view.setUint32(ACK_HEADER_SIZE + j * 4, indices[j], true);
    }

    const channel = ctx.dataChannels.get(peerId);
    if (channel?.readyState === 'open') channel.send(buf);
  });
  pendingAcks.clear();
}

// ========================
// ACK PROCESSING — Logic xử lý ACK dùng chung cho cả JSON lẻ và binary batch
// ========================
export function processFileAcks(peerId: string, fileId: string, chunkIndices: number[]) {
  const outgoing = ctx.outgoingFiles.get(fileId);
  if (!outgoing) return;

  // 1-1 model: chỉ theo dõi duy nhất 1 recipient peer
  let peerAck = outgoing.peerAcked.get(peerId);
  if (!peerAck) {
    peerAck = new Set();
    outgoing.peerAcked.set(peerId, peerAck);
  }
  for (const idx of chunkIndices) {
    peerAck.add(idx);
  }

  const channel = ctx.dataChannels.get(peerId);
  if (!channel || channel.readyState !== 'open') {
    // Channel đã đóng — không xóa outgoingFiles, giữ để re-serve khi peer reconnect
    return;
  }

  const ackedCount = peerAck.size;
  const total = outgoing.meta.totalChunks;
  const isComplete = ackedCount >= total;
  const progress = Math.round((ackedCount / total) * 100);
  const totalBytesSent = ackedCount * FILE_CHUNK_SIZE;

  const now = Date.now();
  let rate = outgoing.currentRate;
  if (!outgoing.lastRateUpdate || now - outgoing.lastRateUpdate >= 1000 || isComplete) {
    if (outgoing.lastRateUpdate && outgoing.lastRateBytes) {
      const elapsedSec = (now - outgoing.lastRateUpdate) / 1000;
      rate = (totalBytesSent - outgoing.lastRateBytes) / Math.max(elapsedSec, 0.1);
      outgoing.currentRate = rate;
    }
    outgoing.lastRateUpdate = now;
    outgoing.lastRateBytes = totalBytesSent;
  }

  if (progress % 5 === 0 || now - (outgoing.lastAckProgressUpdate || 0) > 200 || isComplete) {
    updateMessageFileProgress(fileId, progress, undefined, isComplete, undefined, rate);
    outgoing.lastAckProgressUpdate = now;

    if (isComplete) {
      log.dc.info(`Hoàn tất gửi file: ${outgoing.meta.name} cho ${peerId}.`);
      // Giữ lại outgoingFiles để có thể re-serve khi peer reconnect sau F5
    }
  }
}

export function handleBinaryAckBatch(peerId: string, buffer: ArrayBuffer) {
  // Binary ACK format: [1 byte magic=0xAC][36 bytes fileId][4 bytes count][4 bytes × N indices]
  const ACK_HEADER_SIZE = 1 + FILE_ID_BYTES + 4;
  if (buffer.byteLength < ACK_HEADER_SIZE) return;

  const bytes = new Uint8Array(buffer);
  const fileId = TEXT_DECODER.decode(bytes.subarray(1, 1 + FILE_ID_BYTES)).replace(/\0/g, '');
  const view = new DataView(buffer);
  const count = view.getUint32(1 + FILE_ID_BYTES, true);

  if (buffer.byteLength < ACK_HEADER_SIZE + count * 4) return;

  const indices: number[] = [];
  for (let k = 0; k < count; k++) {
    indices.push(view.getUint32(ACK_HEADER_SIZE + k * 4, true));
  }

  processFileAcks(peerId, fileId, indices);
}
