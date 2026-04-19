import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import {
  handleChatPayload,
  handleTypingPayload,
  handleMessageRead,
  handleMessageReadBatch,
  handleMessageReact,
  handleMessageHideLocal,
  handleMessageDelete,
  handleMessageEdit,
  handlePing,
  handleFileDownloadReq,
  handleFileDownloadAbort
} from './dataChannel';
import type { ChatMessage } from '$lib/type';

vi.mock('$lib/features/webrtc/dataChannels/fileTransfer/fileSender', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('$lib/features/webrtc/dataChannels/fileTransfer/fileSender')
    >();
  return {
    ...actual,
    sendChunksToSinglePeer: vi.fn(),
    ensureOutgoingFile: vi.fn().mockResolvedValue(true)
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTextMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg_1',
    senderId: 'peer_1',
    senderName: 'Alice',
    peerId: 'peer_1',
    timestamp: 1000,
    isSelf: true,
    type: 'text',
    text: 'Hello',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// handleChatPayload
// ---------------------------------------------------------------------------

describe('handleChatPayload', () => {
  beforeEach(() => {
    ctx.messages = {};
    ctx.remoteMediaStreams = {};
    ctx.currentUser = { id: 'me', name: 'Me' };
  });

  it('marks message as not self and adds to store', async () => {
    await handleChatPayload('peer_1', {
      type: 'chat',
      peerId: 'peer_1',
      message: makeTextMsg({ isSelf: true, peerId: undefined })
    });

    const msgs = ctx.messages['peer_1'];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].isSelf).toBe(false);
    expect(msgs[0].peerId).toBe('peer_1');
  });

  it('clears remoteMediaStream when screen_share_stop system event is received', async () => {
    ctx.remoteMediaStreams = { peer_1: {} as MediaStream };

    await handleChatPayload('peer_1', {
      type: 'chat',
      peerId: 'peer_1',
      message: makeTextMsg({ type: 'system', systemEvent: 'screenShareStop' })
    });

    expect(ctx.remoteMediaStreams['peer_1']).toBeUndefined();
  });

  it('does not clear stream for other system events', async () => {
    ctx.remoteMediaStreams = { peer_1: {} as MediaStream };

    await handleChatPayload('peer_1', {
      type: 'chat',
      peerId: 'peer_1',
      message: makeTextMsg({ type: 'system', systemEvent: 'screenShareStart' })
    });

    expect(ctx.remoteMediaStreams['peer_1']).toBeDefined();
  });

  describe('Voice & Video Call Events', () => {
    it('sets call state to ringing when receiving call_offer and is currently idle', async () => {
      ctx.callState = 'idle';

      await handleChatPayload('peer_2', {
        type: 'chat',
        peerId: 'peer_2',
        message: makeTextMsg({ type: 'system', systemEvent: 'callOffer', text: 'audio' })
      });

      expect(ctx.callState).toBe('ringing');
      expect(ctx.callPeerId).toBe('peer_2');
      expect(ctx.callIsIncoming).toBe(true);
      expect(ctx.callWithVideo).toBe(false);
    });

    it('rejects call automatically (does not change state) when receiving call_offer but already busy', async () => {
      // Giả lập A và B đang trong cuộc gọi
      ctx.callState = 'in_call';
      ctx.callPeerId = 'peer_1';

      // Lắng nghe xem system có sinh ra action gửi call_busy không
      await handleChatPayload('peer_C', {
        type: 'chat',
        peerId: 'peer_C',
        message: makeTextMsg({ type: 'system', systemEvent: 'callOffer' })
      });

      // Assert state vẫn giữ nguyên của cuộc gọi hiện tại với peer_1, không bị đè bởi peer_C
      expect(ctx.callState).toBe('in_call');
      expect(ctx.callPeerId).toBe('peer_1');
    });

    it('Scenario 2 (Glare / Simultaneous Call): resolves glare when A and B call exactly at the same time', async () => {
      // Giả lập A vừa bấm gọi B (chưa kịp nhận phản hồi, đang pending)
      ctx.callState = 'ringing';
      ctx.callPeerId = 'peer_B';
      ctx.callIsIncoming = false;

      // Cùng lúc đó tíc tắc, mạng truyền tới gói `call_offer` của B.
      // (Dưới khoá cạnh của B, B cũng vừa bấm gọi A rào rạt)
      await handleChatPayload('peer_B', {
        type: 'chat',
        peerId: 'peer_B',
        message: makeTextMsg({ type: 'system', systemEvent: 'callOffer', text: 'audio' })
      });

      // Assert: Máy A phải dập ngay lời gọi của B.
      // Trạng thái call của A phải ĐƯỢC BẢO TOÀN là đang đổ chuông (ringing),
      // tuyệt đối không bị loạn thành gọi tới (làm reset mất local stream).
      expect(ctx.callState).toBe('ringing');
      expect(ctx.callPeerId).toBe('peer_B');
      expect(ctx.callIsIncoming).toBe(false); // Vẫn là A đang xuất phát (outbound)
    });

    it('rejects incoming call if A is currently presenting their screen', async () => {
      ctx.callState = 'idle';
      ctx.callPeerId = null;
      ctx.localMediaStream = {} as MediaStream;

      await handleChatPayload('peer_C', {
        type: 'chat',
        peerId: 'peer_C',
        message: makeTextMsg({ type: 'system', systemEvent: 'callOffer' })
      });

      // Chặn cuộc gọi, không cho đổ chuông đè lên màn hình
      expect(ctx.callState).toBe('idle');
      expect(ctx.callPeerId).toBeNull();
    });

    it("rejects incoming call if A is currently watching someone else's screen", async () => {
      ctx.callState = 'idle';
      ctx.callPeerId = null;
      ctx.remoteMediaStreams = { peer_B: {} as MediaStream };

      await handleChatPayload('peer_C', {
        type: 'chat',
        peerId: 'peer_C',
        message: makeTextMsg({ type: 'system', systemEvent: 'callOffer' })
      });

      expect(ctx.callState).toBe('idle');
      expect(ctx.callPeerId).toBeNull();
    });

    it('transitions to in_call when receiving call_accepted', async () => {
      ctx.callState = 'ringing';
      ctx.callPeerId = 'peer_1';

      await handleChatPayload('peer_1', {
        type: 'chat',
        peerId: 'peer_1',
        message: makeTextMsg({ type: 'system', systemEvent: 'callAccepted' })
      });

      expect(ctx.callState).toBe('in_call');
    });

    it('clears state (resets call) when receiving call_busy', async () => {
      ctx.callState = 'ringing';
      ctx.callPeerId = 'peer_1';
      ctx.localCallStream = { getTracks: () => [] } as unknown as MediaStream; // Giả lập có bật stream

      await handleChatPayload('peer_1', {
        type: 'chat',
        peerId: 'peer_1',
        message: makeTextMsg({ type: 'system', systemEvent: 'callBusy' })
      });

      expect(ctx.callState).toBe('idle');
      expect(ctx.callPeerId).toBeNull();
      expect(ctx.localCallStream).toBeNull();
    });

    it('clears state when receiving call_declined', async () => {
      ctx.callState = 'ringing';
      ctx.callPeerId = 'peer_1';
      ctx.localCallStream = { getTracks: () => [] } as unknown as MediaStream;

      await handleChatPayload('peer_1', {
        type: 'chat',
        peerId: 'peer_1',
        message: makeTextMsg({ type: 'system', systemEvent: 'callDeclined' })
      });

      expect(ctx.callState).toBe('idle');
      expect(ctx.callPeerId).toBeNull();
    });

    it('clears state when receiving call_ended', async () => {
      ctx.callState = 'in_call';
      ctx.callPeerId = 'peer_1';
      ctx.localCallStream = { getTracks: () => [] } as unknown as MediaStream;

      await handleChatPayload('peer_1', {
        type: 'chat',
        peerId: 'peer_1',
        message: makeTextMsg({ type: 'system', systemEvent: 'callEnded' })
      });

      expect(ctx.callState).toBe('idle');
      expect(ctx.callPeerId).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// handleTypingPayload
// ---------------------------------------------------------------------------

describe('handleTypingPayload', () => {
  beforeEach(() => {
    ctx.typingUsers.clear();
  });

  it('adds peer to typingUsers when isTyping=true', () => {
    handleTypingPayload('peer_1', { type: 'typing', peerId: 'peer_1', isTyping: true });
    expect(ctx.typingUsers.has('peer_1')).toBe(true);
  });

  it('removes peer from typingUsers when isTyping=false', () => {
    ctx.typingUsers.set('peer_1', Date.now());

    handleTypingPayload('peer_1', { type: 'typing', peerId: 'peer_1', isTyping: false });

    expect(ctx.typingUsers.has('peer_1')).toBe(false);
  });

  it('uses payload.peerId when provided instead of peerId arg', () => {
    handleTypingPayload('peer_1', { type: 'typing', isTyping: true, peerId: 'alias_peer' });
    expect(ctx.typingUsers.has('alias_peer')).toBe(true);
    expect(ctx.typingUsers.has('peer_1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleMessageRead
// ---------------------------------------------------------------------------

describe('handleMessageRead', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [makeTextMsg({ id: 'msg_1', read: false })]
    };
  });

  it('marks message as read', () => {
    handleMessageRead('peer_1', { type: 'message_read', messageId: 'msg_1', peerId: 'peer_1' });
    expect(ctx.messages['peer_1'][0].read).toBe(true);
  });

  it('does not mutate if message is already read', () => {
    ctx.messages['peer_1'][0] = { ...ctx.messages['peer_1'][0], read: true };
    const ref = ctx.messages['peer_1'];

    handleMessageRead('peer_1', { type: 'message_read', messageId: 'msg_1', peerId: 'peer_1' });

    // Không tạo reference mới khi không có thay đổi
    expect(ctx.messages['peer_1']).toBe(ref);
  });

  it('does nothing when messageId does not exist', () => {
    handleMessageRead('peer_1', { type: 'message_read', messageId: 'ghost', peerId: 'peer_1' });
    expect(ctx.messages['peer_1'][0].read).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// handleMessageReadBatch
// ---------------------------------------------------------------------------

describe('handleMessageReadBatch', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [
        makeTextMsg({ id: 'msg_1', read: false }),
        makeTextMsg({ id: 'msg_2', read: false }),
        makeTextMsg({ id: 'msg_3', read: true })
      ]
    };
  });

  it('marks multiple messages as read at once', () => {
    handleMessageReadBatch('peer_1', {
      type: 'message_read_batch',
      messageIds: ['msg_1', 'msg_2'],
      peerId: 'peer_1'
    });

    expect(ctx.messages['peer_1'][0].read).toBe(true);
    expect(ctx.messages['peer_1'][1].read).toBe(true);
  });

  it('does not create a new array when nothing changed', () => {
    const ref = ctx.messages['peer_1'];

    handleMessageReadBatch('peer_1', {
      type: 'message_read_batch',
      messageIds: ['msg_3'], // already read
      peerId: 'peer_1'
    });

    expect(ctx.messages['peer_1']).toBe(ref);
  });
});

// ---------------------------------------------------------------------------
// handleMessageReact
// ---------------------------------------------------------------------------

describe('handleMessageReact', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [makeTextMsg({ id: 'msg_1', reactions: {} })]
    };
  });

  it('adds a reaction from the sender', () => {
    handleMessageReact('peer_1', {
      type: 'message_react',
      messageId: 'msg_1',
      reaction: '👍',
      peerId: 'peer_1'
    });
    expect(ctx.messages['peer_1'][0].reactions?.['peer_1']).toBe('👍');
  });

  it('toggles off the same reaction when sent again', () => {
    ctx.messages['peer_1'][0] = { ...ctx.messages['peer_1'][0], reactions: { peer_1: '👍' } };

    handleMessageReact('peer_1', {
      type: 'message_react',
      messageId: 'msg_1',
      reaction: '👍',
      peerId: 'peer_1'
    });

    expect(ctx.messages['peer_1'][0].reactions?.['peer_1']).toBeUndefined();
  });

  it('switches to a different reaction', () => {
    ctx.messages['peer_1'][0] = { ...ctx.messages['peer_1'][0], reactions: { peer_1: '👍' } };

    handleMessageReact('peer_1', {
      type: 'message_react',
      messageId: 'msg_1',
      reaction: '❤️',
      peerId: 'peer_1'
    });

    expect(ctx.messages['peer_1'][0].reactions?.['peer_1']).toBe('❤️');
  });

  it('removes all reactions when empty string passed', () => {
    ctx.messages['peer_1'][0] = { ...ctx.messages['peer_1'][0], reactions: { peer_1: '👍' } };

    handleMessageReact('peer_1', {
      type: 'message_react',
      messageId: 'msg_1',
      reaction: '',
      peerId: 'peer_1'
    });

    expect(ctx.messages['peer_1'][0].reactions?.['peer_1']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleMessageHideLocal
// ---------------------------------------------------------------------------

describe('handleMessageHideLocal', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [makeTextMsg({ id: 'msg_1', hiddenFromPeers: [] })]
    };
  });

  it('appends peerId to hiddenFromPeers', () => {
    handleMessageHideLocal('peer_1', {
      type: 'message_hide_local',
      messageId: 'msg_1',
      peerId: 'peer_1'
    });

    expect(ctx.messages['peer_1'][0].hiddenFromPeers).toContain('peer_1');
  });

  it('preserves existing hiddenFromPeers entries', () => {
    ctx.messages['peer_1'][0] = {
      ...ctx.messages['peer_1'][0],
      hiddenFromPeers: ['peer_3']
    };

    handleMessageHideLocal('peer_1', {
      type: 'message_hide_local',
      messageId: 'msg_1',
      peerId: 'peer_1'
    });

    expect(ctx.messages['peer_1'][0].hiddenFromPeers).toEqual(['peer_3', 'peer_1']);
  });
});

// ---------------------------------------------------------------------------
// handleMessageDelete
// ---------------------------------------------------------------------------

describe('handleMessageDelete', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [makeTextMsg({ id: 'msg_1', text: 'hello', type: 'text' })]
    };
  });

  it('sets isDeleted=true and clears text/file/replyPreview', () => {
    handleMessageDelete('peer_1', {
      type: 'message_delete',
      messageId: 'msg_1',
      peerId: 'peer_1'
    });

    const msg = ctx.messages['peer_1'][0];
    expect(msg.isDeleted).toBe(true);
    expect(msg.text).toBeUndefined();
    expect(msg.file).toBeUndefined();
    expect(msg.replyPreview).toBeUndefined();
  });

  it('leaves other messages in the room untouched', () => {
    ctx.messages['peer_1'].push(makeTextMsg({ id: 'msg_2', text: 'world' }));

    handleMessageDelete('peer_1', {
      type: 'message_delete',
      messageId: 'msg_1',
      peerId: 'peer_1'
    });

    expect(ctx.messages['peer_1'][1].text).toBe('world');
    expect(ctx.messages['peer_1'][1].isDeleted).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// handleMessageEdit
// ---------------------------------------------------------------------------

describe('handleMessageEdit', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [makeTextMsg({ id: 'msg_1', text: 'original' })]
    };
  });

  it('updates text and sets isEdited=true', () => {
    handleMessageEdit('peer_1', {
      type: 'message_edit',
      messageId: 'msg_1',
      newText: 'updated text',
      peerId: 'peer_1'
    });

    const msg = ctx.messages['peer_1'][0];
    expect(msg.text).toBe('updated text');
    expect(msg.isEdited).toBe(true);
  });

  it('does nothing when messageId is not found', () => {
    handleMessageEdit('peer_1', {
      type: 'message_edit',
      messageId: 'ghost',
      newText: 'x',
      peerId: 'peer_1'
    });
    expect(ctx.messages['peer_1'][0].text).toBe('original');
  });
});

// ---------------------------------------------------------------------------
// handlePing
// ---------------------------------------------------------------------------

describe('handlePing', () => {
  beforeEach(() => {
    ctx.dataChannels.clear();
  });

  it('sends pong when channel is open', () => {
    const mockSend = vi.fn();
    ctx.dataChannels.set('peer_1', {
      readyState: 'open',
      send: mockSend
    } as unknown as RTCDataChannel);

    handlePing('peer_1');

    expect(mockSend).toHaveBeenCalledWith(JSON.stringify({ type: 'pong' }));
  });

  it('does not send when channel is closed', () => {
    const mockSend = vi.fn();
    ctx.dataChannels.set('peer_1', {
      readyState: 'closed',
      send: mockSend
    } as unknown as RTCDataChannel);

    handlePing('peer_1');

    expect(mockSend).not.toHaveBeenCalled();
  });
  it('does not throw for unknown peer', () => {
    expect(() => handlePing('unknown_peer')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleFileDownloadReq & handleFileDownloadAbort (Sync / F5 Recovery)
// ---------------------------------------------------------------------------

describe('File Sync Recovery & Abort', () => {
  beforeEach(() => {
    ctx.outgoingFiles.clear();
  });

  it('resumes sending file when receiving file_download_req (peer F5s and re-requests)', async () => {
    const { sendChunksToSinglePeer } =
      await import('$lib/features/webrtc/dataChannels/fileTransfer/fileSender');
    const mockOutgoing = {
      meta: { id: 'file_1', name: 'image.png' },
      isCancelled: false,
      targetPeers: new Set<string>(),
      downloadRequestedPeers: new Set<string>(),
      peerAcked: new Map(),
      lastRateUpdate: 12345,
      lastAckProgressUpdate: 12345
    };
    ctx.outgoingFiles.set(
      'file_1',
      mockOutgoing as unknown as Parameters<typeof ctx.outgoingFiles.set>[1]
    );

    await handleFileDownloadReq('peer_2', { type: 'file_download_req', id: 'file_1' });

    // Đảm bảo peer được đưa vào danh sách đích (targetPeers) và đánh dấu là đã yêu cầu
    expect(mockOutgoing.targetPeers.has('peer_2')).toBe(true);
    expect(mockOutgoing.downloadRequestedPeers.has('peer_2')).toBe(true);

    // Đảm bảo reset trạng thái tính toán tốc độ để resuming đúng
    expect(mockOutgoing.lastRateUpdate).toBeUndefined();
    expect(mockOutgoing.lastAckProgressUpdate).toBeUndefined();

    // Xác nhận hàm vận chuyển file bắt đầu chia nhỏ và gửi lại chunk
    expect(sendChunksToSinglePeer).toHaveBeenCalledWith('file_1', 'peer_2');
  });

  it('aborts download requested peer immediately when handleFileDownloadAbort is fired', () => {
    const mockOutgoing = {
      meta: { id: 'file_2', name: 'data.zip' },
      downloadRequestedPeers: new Set(['peer_1', 'peer_2', 'peer_3']),
      peerAcked: new Map()
    };
    ctx.outgoingFiles.set(
      'file_2',
      mockOutgoing as unknown as Parameters<typeof ctx.outgoingFiles.set>[1]
    );

    handleFileDownloadAbort('peer_2', { type: 'file_download_abort', id: 'file_2' });

    // Xác nhận peer_2 đã bị xoá khỏi danh sách nhận stream file
    expect(mockOutgoing.downloadRequestedPeers.has('peer_2')).toBe(false);
    expect(mockOutgoing.downloadRequestedPeers.has('peer_1')).toBe(true);
    expect(mockOutgoing.downloadRequestedPeers.has('peer_3')).toBe(true);
  });

  it('Scenario 1 (Dead Link): handleFileDownloadReq fails safely if sender F5d (outgoingFiles wiped)', async () => {
    // Máy A nhấn F5, xoá sạch sành sanh outgoingFiles memory
    ctx.outgoingFiles.clear();

    const { sendChunksToSinglePeer } =
      await import('$lib/features/webrtc/dataChannels/fileTransfer/fileSender');
    vi.mocked(sendChunksToSinglePeer).mockClear(); // Xóa dấu vết cũ

    // Máy B ngây ngô nhấn "Download" trên UI vì B không biết A đã F5.
    // Lệnh yêu cầu tới A để lấy 'lost_file_id'
    await handleFileDownloadReq('peer_B', { type: 'file_download_req', id: 'lost_file_id' });

    // Quan trọng nhất: A không đụng trúng undefined mà văng Log và dừng cẩn thận.
    // Hoàn toàn không chia nhỏ hay gửi chunk ảo sang làm mệt mạng B!
    expect(sendChunksToSinglePeer).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSyncData - Test F5 Sync Logic
// ---------------------------------------------------------------------------
describe('handleSyncData (F5 Sync Recovery)', () => {
  it('automatically requests download for synced image/video < 10MB', async () => {
    const { handleSyncData } = await import('./dataChannel');

    const mockChannel = { send: vi.fn(), readyState: 'open' };
    ctx.dataChannels.set('peer_A', mockChannel as unknown as RTCDataChannel);

    // B F5, nhận lại mảng lịch sử từ A. Có 1 ảnh 2MB (Bé hơn 10MB)
    const syncedImageMsg = {
      id: 'file_small_img',
      type: 'file',
      senderId: 'peer_A',
      isSelf: false,
      file: { mimeType: 'image/jpeg', size: 2 * 1024 * 1024 }
    } as unknown as ChatMessage;

    await handleSyncData('peer_A', { type: 'sync_data', messages: [syncedImageMsg] });

    // File dưới 10MB -> hệ thống tự móc channel gửi package requestDownload (file_download_req)
    expect(mockChannel.send).toHaveBeenCalled();
    const sentData = JSON.parse(mockChannel.send.mock.calls[0][0]);
    expect(sentData.type).toBe('file_download_req');
    expect(sentData.id).toBe('file_small_img');
  });

  it('does NOT automatically request download for images >= 10MB', async () => {
    const { handleSyncData } = await import('./dataChannel');

    const mockChannel = { send: vi.fn(), readyState: 'open' };
    ctx.dataChannels.set('peer_A', mockChannel as unknown as RTCDataChannel);

    // Kịch bản: B F5, nhưng mảng lịch sử gửi lại có 1 video lớn 15MB
    const syncedHugeVideoMsg = {
      id: 'file_huge_vid',
      type: 'file',
      senderId: 'peer_A',
      isSelf: false,
      file: { mimeType: 'video/mp4', size: 15 * 1024 * 1024 }
    } as unknown as ChatMessage;

    handleSyncData('peer_A', { type: 'sync_data', messages: [syncedHugeVideoMsg] });

    // Lớn hơn 10MB -> Bắt người dùng tự click, chặn Auto-Download!
    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('does NOT automatically request download for Non-Media files (e.g ZIP, PDF)', async () => {
    const { handleSyncData } = await import('./dataChannel');

    const mockChannel = { send: vi.fn(), readyState: 'open' };
    ctx.dataChannels.set('peer_A', mockChannel as unknown as RTCDataChannel);

    // Kích bản B F5, mảng gửi tới một File Document/ZIP dù bé 1KB
    const syncedPdfMsg = {
      id: 'file_pdf_doc',
      type: 'file',
      senderId: 'peer_A',
      isSelf: false,
      file: { mimeType: 'application/pdf', size: 1024 }
    } as unknown as ChatMessage;

    await handleSyncData('peer_A', { type: 'sync_data', messages: [syncedPdfMsg] });

    // Không phải ảnh/video thì KHÔNG DOWLOAD TỰ ĐỘNG
    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('handles 3-round F5 sync logic: A sends B, B F5s and gets sync. Then A F5s and gets sync from B without auto-downloading its own file', async () => {
    const { handleSyncData } = await import('./dataChannel');

    // Môi trường hiện tại: đang xét trên góc nhìn máy A (người gửi) vừa bị F5
    ctx.currentUser = { id: 'peer_A', name: 'Alice' }; // Ta là A
    ctx.messages = {};

    const mockChannel = { send: vi.fn(), readyState: 'open' };
    ctx.dataChannels.set('peer_B', mockChannel as unknown as RTCDataChannel);

    // Kịch bản: B gửi ngược lịch sử lại cho A sau khi A ấn F5
    // Tin nhắn này có senderId = 'peer_A' vì chính A là người tạo ra nó trước lúc F5.
    const syncedHistoryFromB = {
      id: 'my_own_image',
      type: 'file',
      senderId: 'peer_A',
      isSelf: true,
      peerId: 'peer_B',
      file: { mimeType: 'image/jpeg', size: 2 * 1024 * 1024 }
    } as unknown as ChatMessage;

    await handleSyncData('peer_B', { type: 'sync_data', messages: [syncedHistoryFromB] });

    // 1. A nhận lại tin nhắn thành công, khôi phục được view chat nhưng đánh dấu isSelf = true
    const aMessages = ctx.messages['peer_B'];
    expect(aMessages).toBeDefined();
    expect(aMessages.length).toBe(1);
    expect(aMessages[0].id).toBe('my_own_image');
    expect(aMessages[0].isSelf).toBe(true);

    // 2. Theo logic hiện tại, hệ thống vẫn "âm thầm" bắn file_download_req
    // vì không có lệnh chặn msg.senderId !== myId. Dù thừa thải nhưng UI lịch sử vẫn khôi phục đúng.
    expect(mockChannel.send).toHaveBeenCalled();
  });
});
