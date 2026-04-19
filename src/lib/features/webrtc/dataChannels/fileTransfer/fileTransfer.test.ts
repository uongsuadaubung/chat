import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { updateMessageFileState, processFileAcks } from './fileAck';
import { fileIndex } from '../messageChannel';
import type { ChatMessage } from '$lib/type';

vi.mock('$lib/features/webrtc/dataChannels/fileTransfer/fileReader', () => ({
  readSliceAsArrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(16000))
}));

globalThis.requestAnimationFrame = (cb) => {
  setTimeout(cb, 0);
  return 0;
};
globalThis.URL.createObjectURL = vi.fn(() => 'blob:url');
globalThis.URL.revokeObjectURL = vi.fn();

describe('fileTransferChannel logic', () => {
  beforeEach(() => {
    ctx.messages = {
      room_1: [
        {
          id: 'file_123',
          senderId: 'me_123',
          senderName: 'Me',
          timestamp: Date.now(),
          isSelf: true,
          type: 'file',
          file: {
            name: 'test.zip',
            size: 1000,
            mimeType: 'application/zip',
            progress: 0,
            isSending: true
          }
        } as ChatMessage
      ]
    };
    fileIndex.set('file_123', 'room_1');
    ctx.outgoingFiles.clear();
    ctx.dataChannels.clear();
  });

  it('updateMessageFileState correctly modifies state', () => {
    updateMessageFileState('file_123', { isSending: false, progress: 100 });
    const messages = ctx.messages;
    expect(messages['room_1'][0].file?.isSending).toBe(false);
    expect(messages['room_1'][0].file?.progress).toBe(100);
    expect(messages['room_1'][0].file?.name).toBe('test.zip'); // Giữ nguyên thuộc tính khác
  });

  it('processFileAcks updates outgoing peerAcked map', () => {
    // Setup giả lập đang gửi file
    const mockChannel = {
      readyState: 'open',
      send: vi.fn(),
      bufferedAmount: 0
    } as unknown as RTCDataChannel;
    ctx.dataChannels.set('peer_Bob', mockChannel);

    ctx.outgoingFiles.set('file_123', {
      file: new File([], 'test.zip'),
      meta: {
        id: 'file_123',
        senderId: 'me_123',
        name: 'test.zip',
        size: 1000,
        mimeType: 'zip',
        totalChunks: 10
      },
      chunks: [],
      ackedChunks: new Set(),
      peerAcked: new Map(),
      targetPeers: new Set(['peer_Bob'])
    });

    // Bob nhận được 2 chunks đầu tiên và gửi ACK về cho mình
    processFileAcks('peer_Bob', 'file_123', [0, 1]);

    const outgoing = ctx.outgoingFiles.get('file_123')!;
    const bobAcks = outgoing.peerAcked.get('peer_Bob');

    expect(bobAcks).toBeDefined();
    expect(bobAcks?.size).toBe(2);
    expect(bobAcks?.has(0)).toBe(true);
    expect(bobAcks?.has(1)).toBe(true);
  });

  it('Backpressure: sendChunksToSinglePeer PAUSES sending when bufferedAmount > MAX_WEBRTC_BUFFER', async () => {
    // 1. Giả lập một DataChannel bị nghẽn mạng (Buffer ngập họng rác RAM)
    const mockChannel = {
      readyState: 'open',
      send: vi.fn(), // Không được phép gọi hàm này khi nghẽn
      bufferedAmount: 99999999, // Vượt quá MAX_WEBRTC_BUFFER
      addEventListener: vi.fn(), // Hàm waitForBufferDrain sẽ gọi cái này
      removeEventListener: vi.fn()
    } as unknown as RTCDataChannel;
    ctx.dataChannels.set('peer_Slow', mockChannel);

    // 2. Tạo file lớn cho quá trình gửi
    const fakeFile = {
      name: 'large.dat',
      size: 50000,
      slice: () => ({
        arrayBuffer: async () => new Uint8Array(16000).buffer
      })
    } as unknown as File;

    ctx.outgoingFiles.set('file_large', {
      file: fakeFile,
      meta: {
        id: 'file_large',
        senderId: 'me_123',
        name: 'large.dat',
        size: 50000,
        mimeType: 'dat',
        totalChunks: 5 // Vài chunk để test
      },
      chunks: [],
      ackedChunks: new Set(),
      peerAcked: new Map(),
      targetPeers: new Set(['peer_Slow']),
      isCancelled: false
    });

    // 3. Load hàm gửi và chạy
    const { sendChunksToSinglePeer } =
      await import('$lib/features/webrtc/dataChannels/fileTransfer/fileSender');

    // Gọi tạ không thèm await vì nó sẽ bị treo vĩnh viễn (Pending Promise) vòng lặp While chờ xả trạm
    sendChunksToSinglePeer('file_large', 'peer_Slow');

    // Mất 1 nhịp tick nhỏ để code async chạy tới đoạn vướng ngầm `await waitForBufferDrain`
    await new Promise((r) => setTimeout(r, 50));

    // 4. KIỂM TRA QUAN TRỌNG:
    // Hệ thống MẠNG PHẢI khoá hoàn toàn lệnh send, bảo vệ cho máy không bị chèn RAM ArrayBuffer!
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Đồng thời xác nhận hệ thống đã đăng ký nghe ngầm (onbufferedamountlow) thay vì bắn dữ liệu.
    expect(typeof (mockChannel as unknown as Record<string, unknown>).onbufferedamountlow).toBe(
      'function'
    );
  });
});
