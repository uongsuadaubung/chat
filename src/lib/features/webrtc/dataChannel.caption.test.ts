import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SvelteMap } from 'svelte/reactivity';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { handleFileMeta } from '$lib/features/webrtc/dataChannel';

// Mock tất cả side-effects của DataChannel để test logic thuần túy
vi.mock('$lib/features/webrtc/dataChannels/channel.util', () => ({
  sendToPeer: vi.fn()
}));

vi.mock('$lib/features/webrtc/atomicActionManager', () => ({
  atomicActionManager: {
    processOutboxForPeer: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('$lib/features/webrtc/dataChannels/fileTransfer', () => ({
  handleBinaryAckBatch: vi.fn(),
  handleBinaryFileChunk: vi.fn(),
  sendChunksToSinglePeer: vi.fn(),
  readSliceAsArrayBuffer: vi.fn(),
  updateMessageFileState: vi.fn(),
  processFileAcks: vi.fn(),
  requestDownload: vi.fn().mockResolvedValue(undefined),
  cancelDownload: vi.fn(),
  sendFile: vi.fn(),
  waitForBufferDrain: vi.fn(),
  ensureOutgoingFile: vi.fn()
}));

const PEER_ID = 'peer_1';

describe('handleFileMeta — caption threading', () => {
  beforeEach(() => {
    ctx.messages = {};
    ctx.typingUsers = new SvelteMap();
    ctx.outgoingFiles.clear();
    ctx.incomingFiles.clear();
    ctx.dataChannels.clear();
    ctx.currentUser = { id: 'me_123', name: 'Me' };
    // Cung cấp peer để senderName resolve đúng
    ctx.peer = [{ id: PEER_ID, name: 'Alice', color: '#abc', connected: true }];
  });

  it('stores caption as text in the received ChatMessage', async () => {
    await handleFileMeta(PEER_ID, {
      type: 'file_meta',
      peerId: PEER_ID,
      meta: {
        id: 'file_caption_1',
        senderId: PEER_ID,
        name: 'paste_123.png',
        // Kích thước lớn hơn auto-download limit để tránh requestDownload phức tạp
        size: 200 * 1024 * 1024,
        mimeType: 'image/png',
        totalChunks: 3,
        timestamp: 1000,
        caption: 'Đây là caption của ảnh'
      }
    });

    const msgs = ctx.messages[PEER_ID] ?? [];
    const fileMsg = msgs.find((m) => m.id === 'file_caption_1');
    expect(fileMsg).toBeDefined();
    expect(fileMsg?.text).toBe('Đây là caption của ảnh');
    expect(fileMsg?.type).toBe('file');
    expect(fileMsg?.isSelf).toBe(false);
    expect(fileMsg?.senderName).toBe('Alice');
  });

  it('creates ChatMessage with undefined text when no caption provided', async () => {
    await handleFileMeta(PEER_ID, {
      type: 'file_meta',
      peerId: PEER_ID,
      meta: {
        id: 'file_no_caption',
        senderId: PEER_ID,
        name: 'photo.jpg',
        size: 200 * 1024 * 1024,
        mimeType: 'image/jpeg',
        totalChunks: 1,
        timestamp: 2000
        // caption không có
      }
    });

    const msgs = ctx.messages[PEER_ID] ?? [];
    const fileMsg = msgs.find((m) => m.id === 'file_no_caption');
    expect(fileMsg).toBeDefined();
    expect(fileMsg?.text).toBeUndefined();
  });

  it('preserves file metadata alongside caption text', async () => {
    await handleFileMeta(PEER_ID, {
      type: 'file_meta',
      peerId: PEER_ID,
      meta: {
        id: 'file_meta_check',
        senderId: PEER_ID,
        name: 'screenshot.png',
        size: 200 * 1024 * 1024,
        mimeType: 'image/png',
        totalChunks: 5,
        timestamp: 3000,
        caption: 'Check this out!'
      }
    });

    const msgs = ctx.messages[PEER_ID] ?? [];
    const fileMsg = msgs.find((m) => m.id === 'file_meta_check');
    expect(fileMsg?.file?.name).toBe('screenshot.png');
    expect(fileMsg?.file?.mimeType).toBe('image/png');
    expect(fileMsg?.text).toBe('Check this out!');
    // Kích thước lớn → phải là pending download (không auto-download)
    expect(fileMsg?.file?.isPendingDownload).toBe(true);
  });

  it('resolves senderName as Unknown when peer is not in ctx.peer', async () => {
    ctx.peer = []; // xóa peer list

    await handleFileMeta('unknown_peer', {
      type: 'file_meta',
      peerId: 'unknown_peer',
      meta: {
        id: 'file_unknown_sender',
        senderId: 'unknown_peer',
        name: 'anon.png',
        size: 200 * 1024 * 1024,
        mimeType: 'image/png',
        totalChunks: 1,
        timestamp: 4000,
        caption: 'From unknown'
      }
    });

    const msgs = ctx.messages['unknown_peer'] ?? [];
    const fileMsg = msgs.find((m) => m.id === 'file_unknown_sender');
    expect(fileMsg?.senderName).toBe('Unknown');
    expect(fileMsg?.text).toBe('From unknown');
  });
});
