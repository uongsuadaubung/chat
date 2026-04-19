import type { ChatMessage } from '$lib/type';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import {
  FILE_CHUNK_SIZE,
  FILE_ID_BYTES,
  FILE_CHUNK_HEADER_BYTES
} from '$lib/features/webrtc/webrtc.constant';
import { log } from '$lib/core/logger';
import { i18n } from '$lib/features/i18n/i18n.store.svelte';

import { sendToPeer } from '$lib/features/webrtc/dataChannels/channel.util';
import { saveFileBlobToDB, db, getFileBlobFromDB } from '$lib/core/db';
import { blobCache } from '$lib/core/blobCache';
import {
  updateMessageFileProgress,
  updateMessageFileState,
  queueAck,
  flushAcks
} from '$lib/features/webrtc/dataChannels/fileTransfer/fileAck';

const TEXT_DECODER = new TextDecoder();

// INCOMING MESSAGE HANDLER
// ========================
export function handleBinaryFileChunk(peerId: string, buffer: ArrayBuffer) {
  if (buffer.byteLength < FILE_CHUNK_HEADER_BYTES) return;

  // Read 36-byte fileId (ASCII) — dùng cached TEXT_DECODER
  const idBytes = new Uint8Array(buffer, 0, FILE_ID_BYTES);
  // Remove trailing null bytes if UUID string is shorter than 36
  const fileId = TEXT_DECODER.decode(idBytes).replace(/\0/g, '');
  const chunkIndex = new DataView(buffer).getUint32(FILE_ID_BYTES, true);
  const chunkData = new Uint8Array(buffer, FILE_CHUNK_HEADER_BYTES);

  const incoming = ctx.incomingFiles.get(fileId);
  // Bỏ qua nếu chưa download hoặc đã nhận chunk này rồi
  if (!incoming || incoming.isPendingDownload) return;

  if (!incoming.receivedChunks.has(chunkIndex)) {
    incoming.receivedChunks.add(chunkIndex);

    // Lưu chunk vào RAM
    incoming.chunks[chunkIndex] = chunkData;

    const progress = Math.round((incoming.receivedChunks.size / incoming.meta.totalChunks) * 100);
    const totalBytesReceived = Math.min(
      incoming.receivedChunks.size * FILE_CHUNK_SIZE,
      incoming.meta.size
    );

    const now = Date.now();
    let rate = incoming.currentRate;

    if (!incoming.lastRateUpdate || now - incoming.lastRateUpdate >= 1000 || progress === 100) {
      if (incoming.lastRateUpdate && incoming.lastRateBytes) {
        const elapsedSec = (now - incoming.lastRateUpdate) / 1000;
        rate = (totalBytesReceived - incoming.lastRateBytes) / Math.max(elapsedSec, 0.1);
        incoming.currentRate = rate;
      }
      incoming.lastRateUpdate = now;
      incoming.lastRateBytes = totalBytesReceived;
    }

    if (progress % 5 === 0 || now - (incoming.lastProgressUpdate || 0) > 200) {
      updateMessageFileProgress(fileId, progress, undefined, false, undefined, rate);
      incoming.lastProgressUpdate = now;
    }

    // Queue ACK — sẽ được batch gửi binary mỗi 50ms
    queueAck(peerId, fileId, chunkIndex);

    // Hoàn tất khi đã nhận 100% chunks
    if (incoming.receivedChunks.size === incoming.meta.totalChunks) {
      // Flush ACK cuối cùng ngay lập tức trước khi dọn dẹp
      flushAcks();

      // Ghép blob URL
      try {
        const finalBlob = new Blob(incoming.chunks as BlobPart[], {
          type: incoming.meta.mimeType
        });

        // Lưu blob vào IndexedDB
        saveFileBlobToDB(fileId, finalBlob).catch((dbErr) => {
          log.dc.error('[DB] Lỗi lưu Blob vào IndexedDB:', dbErr);
        });

        const finalDataUrl = blobCache.register(fileId, finalBlob);
        updateMessageFileProgress(fileId, 100, finalDataUrl, true);
        log.dc.info(`Đã hoàn tất nhận file và lưu DB: ${incoming.meta.name}`);

        const fileObj = new File([finalBlob], incoming.meta.name, {
          type: incoming.meta.mimeType
        });
        ctx.outgoingFiles.set(fileId, {
          file: fileObj,
          meta: incoming.meta,
          chunks: [],
          ackedChunks: new Set(),
          peerAcked: new Map(),
          targetPeers: new Set()
        });
      } catch (e: unknown) {
        log.dc.error('Lỗi ráp file binary:', e instanceof Error ? e.message : e);
        updateMessageFileProgress(
          fileId,
          progress,
          undefined,
          false,
          i18n.t('fileReconstructError')
        );
      } finally {
        ctx.incomingFiles.delete(fileId);
      }
    }
  }
}

// REQUEST DOWNLOAD — Receiver chủ động yêu cầu tải file
// ========================
export async function requestDownload(
  fileId: string,
  senderPeerId: string,
  fallbackMsg?: ChatMessage,
  userAction: boolean = true
) {
  let incoming = ctx.incomingFiles.get(fileId);

  // Sau khi F5, incomingFiles đã bị xóa — tạo lại entry tạm để nhận chunks
  if (!incoming) {
    let msg: ChatMessage | undefined = fallbackMsg;
    if (!msg) {
      // Single Source of Truth: Truy vấn thẳng IndexedDB
      try {
        const dbMsg = await db.messages.get(fileId);
        if (dbMsg) msg = dbMsg;
      } catch (e: unknown) {
        log.dc.warn('[DB] Lỗi get tin nhắn', e);
      }
    }

    if (!msg || !msg.file) return;

    // Smart Cache Restoration: Khôi phục Lazy Load nếu Blob đã nằm trong máy tính
    if (msg.file.url || ctx.outgoingFiles.has(fileId)) {
      log.dc.info(`[SYNC] File ${fileId} already exists locally. Skipping request.`);
      return;
    }

    const cachedBlob = await getFileBlobFromDB(fileId);
    if (cachedBlob) {
      log.dc.info(`[SYNC] Đã tìm thấy Blob trong IndexedDB! Phục hồi URL và tải luôn.`);
      const restoredUrl = blobCache.register(fileId, cachedBlob);
      updateMessageFileProgress(fileId, 100, restoredUrl, true);

      if (userAction) {
        // Auto-trigger Download khi user cố tình bấm lại
        const a = document.createElement('a');
        a.href = restoredUrl;
        a.download = msg.file.name;
        a.click();
      }
      return;
    }

    const fileSize = msg.file.size ?? 0;
    const mimeType = msg.file.mimeType ?? '';
    const fileName = msg.file.name ?? '';
    const totalChunks = fileSize > 0 ? Math.ceil(fileSize / FILE_CHUNK_SIZE) : 0;

    incoming = {
      meta: {
        id: fileId,
        senderId: senderPeerId,
        name: fileName,
        size: fileSize,
        mimeType,
        totalChunks
      },
      chunks: [],
      receivedChunks: new Set<number>(),
      senderPeerId,
      isPendingDownload: true,
      lastProgressUpdate: Date.now()
    };
    log.dc.info(`[SYNC] Re-created incomingFiles entry for ${fileId} with ${totalChunks} chunks`);
    ctx.incomingFiles.set(fileId, incoming);
  }

  log.dc.info(`[SYNC] Requesting download for ${fileId}`);
  if (!incoming.isPendingDownload) {
    log.dc.warn(`[SYNC] File ${fileId} is not pending download, skipping req`);
    return;
  }

  incoming.isPendingDownload = false;
  updateMessageFileState(fileId, { isPendingDownload: false, isReceiving: true });
  sendToPeer(senderPeerId, { type: 'file_download_req', id: fileId });
}

// CANCEL DOWNLOAD — Receiver chủ động hủy tải file
// ========================
export function cancelDownload(fileId: string, senderPeerId: string) {
  const incoming = ctx.incomingFiles.get(fileId);
  if (!incoming) return;

  log.dc.info(`[SYNC] Hủy tải file ${fileId} từ ${senderPeerId}`);

  // Đặt lại trạng thái file (giữ nguyên receivedChunks thì có thể resume,
  // nhưng theo yêu cầu ta revert hoàn toàn và xóa local memory, trừ khi muốn build tính năng Pause)
  // Revert hoàn toàn:
  incoming.chunks = [];
  incoming.receivedChunks.clear();
  incoming.isPendingDownload = true;
  incoming.lastProgressUpdate = Date.now();
  incoming.currentRate = 0;
  incoming.lastRateBytes = 0;

  // Cập nhật lại UI message thành pending download
  updateMessageFileState(fileId, {
    isReceiving: false,
    isPendingDownload: true,
    progress: 0,
    transferRate: undefined
  });

  // Gửi thông báo abort sang sender
  sendToPeer(senderPeerId, { type: 'file_download_abort', id: fileId });
}
