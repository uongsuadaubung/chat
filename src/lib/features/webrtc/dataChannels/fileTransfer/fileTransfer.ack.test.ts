import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import {
  handleBinaryAckBatch,
  flushProgressUpdates,
  updateMessageFileProgress,
  processFileAcks
} from './fileAck';
import { fileIndex } from '../messageChannel';
import type { ChatMessage } from '$lib/type';

globalThis.requestAnimationFrame = (cb) => {
  setTimeout(cb, 0);
  return 0;
};

describe('handleBinaryAckBatch — binary protocol parsing', () => {
  beforeEach(() => {
    ctx.outgoingFiles.clear();
    ctx.dataChannels.clear();
    ctx.messages = {};
  });

  function buildAckBuffer(fileId: string, chunkIndices: number[]): ArrayBuffer {
    // Binary ACK format: [1 byte magic=0xAC][36 bytes fileId][4 bytes count][4 bytes × N indices]
    const headerSize = 1 + 36 + 4;
    const buf = new ArrayBuffer(headerSize + chunkIndices.length * 4);
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);

    bytes[0] = 0xac; // ACK_MAGIC_BYTE
    const encoded = new TextEncoder().encode(fileId);
    bytes.set(encoded, 1);
    view.setUint32(37, chunkIndices.length, true);
    for (let j = 0; j < chunkIndices.length; j++) {
      view.setUint32(headerSize + j * 4, chunkIndices[j], true);
    }
    return buf;
  }

  it('correctly parses binary ACK buffer and updates peerAcked', () => {
    const fileId = '550e8400-e29b-41d4-a716-446655440000';
    const mockChannel = {
      readyState: 'open',
      send: vi.fn(),
      bufferedAmount: 0
    } as unknown as RTCDataChannel;
    ctx.dataChannels.set('peer_1', mockChannel);

    ctx.outgoingFiles.set(fileId, {
      file: new File([], 'test.bin'),
      meta: {
        id: fileId,
        senderId: 'me',
        name: 'test.bin',
        size: 65536 * 5,
        mimeType: 'application/octet-stream',
        totalChunks: 5
      },
      chunks: [],
      ackedChunks: new Set(),
      peerAcked: new Map(),
      targetPeers: new Set(['peer_1'])
    });

    const buffer = buildAckBuffer(fileId, [0, 1, 2]);
    handleBinaryAckBatch('peer_1', buffer);

    const outgoing = ctx.outgoingFiles.get(fileId)!;
    const peerAck = outgoing.peerAcked.get('peer_1');
    expect(peerAck).toBeDefined();
    expect(peerAck!.size).toBe(3);
    expect(peerAck!.has(0)).toBe(true);
    expect(peerAck!.has(1)).toBe(true);
    expect(peerAck!.has(2)).toBe(true);
  });

  it('ignores buffer that is too short', () => {
    const tooShort = new ArrayBuffer(10); // < 41 bytes minimum
    // Phải không throw
    expect(() => handleBinaryAckBatch('peer_1', tooShort)).not.toThrow();
  });

  it('ignores buffer with mismatched count vs actual data', () => {
    // Header says 100 chunks but buffer only has space for 0
    const headerSize = 1 + 36 + 4;
    const buf = new ArrayBuffer(headerSize);
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);
    bytes[0] = 0xac;
    bytes.set(new TextEncoder().encode('fake-file-id-padding-to-36chars!!'), 1);
    view.setUint32(37, 100, true); // count = 100 nhưng không có data

    expect(() => handleBinaryAckBatch('peer_1', buf)).not.toThrow();
  });
});

describe('flushProgressUpdates — batch progress to store', () => {
  beforeEach(() => {
    ctx.messages = {};
  });

  it('updates file progress in messages store', () => {
    ctx.messages = {
      room_1: [
        {
          id: 'file_abc',
          senderId: 'peer_1',
          senderName: 'Peer',
          timestamp: Date.now(),
          isSelf: false,
          type: 'file',
          file: {
            name: 'doc.pdf',
            size: 10000,
            mimeType: 'application/pdf',
            progress: 0,
            isReceiving: true
          }
        } as ChatMessage
      ]
    };
    fileIndex.set('file_abc', 'room_1');

    // Gọi updateMessageFileProgress rồi flush
    updateMessageFileProgress('file_abc', 50, undefined, false, undefined, 1024);
    flushProgressUpdates();

    const messages = ctx.messages;
    expect(messages['room_1'][0].file?.progress).toBe(50);
    expect(messages['room_1'][0].file?.transferRate).toBe(1024);
    expect(messages['room_1'][0].file?.isReceiving).toBe(true); // Chưa complete
  });

  it('sets isReceiving/isSending to false on complete', () => {
    ctx.messages = {
      room_1: [
        {
          id: 'file_xyz',
          senderId: 'me',
          senderName: 'Me',
          timestamp: Date.now(),
          isSelf: true,
          type: 'file',
          file: {
            name: 'video.mp4',
            size: 50000,
            mimeType: 'video/mp4',
            progress: 95,
            isSending: true
          }
        } as ChatMessage
      ]
    };
    fileIndex.set('file_xyz', 'room_1');

    // complete=true triggers immediate flush
    updateMessageFileProgress('file_xyz', 100, 'blob:url/final', true);

    const messages = ctx.messages;
    expect(messages['room_1'][0].file?.progress).toBe(100);
    expect(messages['room_1'][0].file?.url).toBe('blob:url/final');
    expect(messages['room_1'][0].file?.isSending).toBe(false);
  });

  it('sets isReceiving to false on error', () => {
    ctx.messages = {
      room_1: [
        {
          id: 'file_err',
          senderId: 'peer_2',
          senderName: 'Peer',
          timestamp: Date.now(),
          isSelf: false,
          type: 'file',
          file: {
            name: 'broken.zip',
            size: 9999,
            mimeType: 'application/zip',
            progress: 30,
            isReceiving: true
          }
        } as ChatMessage
      ]
    };
    fileIndex.set('file_err', 'room_1');

    updateMessageFileProgress('file_err', 30, undefined, false, 'File reconstruction error');

    const messages = ctx.messages;
    expect(messages['room_1'][0].file?.isReceiving).toBe(false);
    expect(messages['room_1'][0].file?.error).toBe('File reconstruction error');
  });

  it('silently skips update when fileId is not in fileIndex', () => {
    // fileIndex không có 'unknown' → flushProgressUpdates phải thoát không throw
    updateMessageFileProgress('unknown_file', 50);
    expect(() => flushProgressUpdates()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe('processFileAcks — completion tracking', () => {
  beforeEach(() => {
    ctx.messages = {
      room_1: [
        {
          id: 'file_complete',
          senderId: 'me_123',
          senderName: 'Me',
          timestamp: Date.now(),
          isSelf: true,
          type: 'file',
          file: {
            name: 'big.zip',
            size: 3 * 65536,
            mimeType: 'application/zip',
            progress: 0,
            isSending: true
          }
        } as ChatMessage
      ]
    };
    fileIndex.set('file_complete', 'room_1');
    ctx.dataChannels.clear();
    ctx.outgoingFiles.clear();
  });

  it('sets progress to 100 and clears isSending when all chunks ACKed', () => {
    const mockChannel = {
      readyState: 'open',
      send: vi.fn(),
      bufferedAmount: 0
    } as unknown as RTCDataChannel;
    ctx.dataChannels.set('peer_1', mockChannel);

    ctx.outgoingFiles.set('file_complete', {
      file: new File([], 'big.zip'),
      meta: {
        id: 'file_complete',
        senderId: 'me_123',
        name: 'big.zip',
        size: 3 * 65536,
        mimeType: 'application/zip',
        totalChunks: 3
      },
      chunks: [],
      ackedChunks: new Set(),
      peerAcked: new Map(),
      targetPeers: new Set(['peer_1'])
    });

    processFileAcks('peer_1', 'file_complete', [0, 1, 2]);

    const file = ctx.messages['room_1'][0].file;
    expect(file?.progress).toBe(100);
    expect(file?.isSending).toBe(false);
  });

  it('does not crash when outgoingFiles has no entry for fileId', () => {
    expect(() => processFileAcks('peer_1', 'ghost_file', [0, 1])).not.toThrow();
  });
});
