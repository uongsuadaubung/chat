import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ctx } from './webrtc.context.svelte';
import { cleanupPeer } from './peerConnection';
import { updatePeerStatus } from './peer';

// Mock các module có side-effect bên ngoài
vi.mock('$lib/features/webrtc/signaling', () => ({
  sendSignal: vi.fn(),
  handleSignal: vi.fn()
}));

vi.mock('$lib/features/webrtc/dataChannel', () => ({
  setupDataChannel: vi.fn(),
  sendChat: vi.fn()
}));

vi.mock('$lib/shared/stores/appSettings.store.svelte', () => ({
  appSettings: { settings: { screenShareProfile: 'detail' } },
  SCREEN_SHARE_PROFILES: { MOTION: 'motion', DETAIL: 'detail' }
}));

// Helper tạo RTCPeerConnection mock
function createMockPc(): RTCPeerConnection {
  return {
    close: vi.fn(),
    addTrack: vi.fn(),
    getSenders: vi.fn(() => []),
    removeTrack: vi.fn(),
    createDataChannel: vi.fn(() => ({
      onopen: null,
      onclose: null,
      onmessage: null,
      onerror: null,
      send: vi.fn(),
      readyState: 'open'
    })),
    onicecandidate: null,
    onconnectionstatechange: null,
    oniceconnectionstatechange: null,
    onnegotiationneeded: null,
    ondatachannel: null,
    ontrack: null,
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'sdp' }),
    signalingState: 'stable',
    localDescription: { type: 'offer', sdp: 'sdp' },
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    restartIce: vi.fn(),
    connectionState: 'new',
    iceConnectionState: 'new',
    bufferedAmount: 0
  } as unknown as RTCPeerConnection;
}

describe('cleanupPeer', () => {
  beforeEach(() => {
    ctx.peer = [];
    ctx.connections.clear();
    ctx.dataChannels.clear();
    ctx.pendingCandidates.clear();
    ctx.earlySignals.clear();
    ctx.incomingFiles.clear();
    ctx.outgoingFiles.clear();
  });

  it('closes and removes the RTCPeerConnection', () => {
    const mockPc = createMockPc();
    ctx.connections.set('peer_1', mockPc);

    cleanupPeer('peer_1');

    expect(mockPc.close).toHaveBeenCalledOnce();
    expect(ctx.connections.has('peer_1')).toBe(false);
  });

  it('removes dataChannel, pendingCandidates, and earlySignals for the peer', () => {
    const mockDc = { readyState: 'open', send: vi.fn() } as unknown as RTCDataChannel;
    ctx.dataChannels.set('peer_1', mockDc);
    ctx.pendingCandidates.set('peer_1', []);
    ctx.earlySignals.set('peer_1', []);

    cleanupPeer('peer_1');

    expect(ctx.dataChannels.has('peer_1')).toBe(false);
    expect(ctx.pendingCandidates.has('peer_1')).toBe(false);
    expect(ctx.earlySignals.has('peer_1')).toBe(false);
  });

  it('removes peer from peer list', () => {
    updatePeerStatus('peer_1', 'Alice', true);
    expect(ctx.peer.length).toBe(1);

    cleanupPeer('peer_1');

    expect(ctx.peer.length).toBe(0);
  });

  it('immediately ends an active call if the connected caller reloads (F5) or disconnects', () => {
    // Giả lập đang gọi video với peer_1
    ctx.callState = 'in_call';
    ctx.callPeerId = 'peer_1';
    ctx.localCallStream = { getTracks: () => [] } as unknown as MediaStream;

    // peer_1 F5 hoặc đứt cáp
    cleanupPeer('peer_1');

    // Chặn Regression: Phải đảm bảo cuộc gọi bị huỷ bỏ, mic/cam tắt khi rớt mạng
    expect(ctx.callState).toBe('idle');
    expect(ctx.callPeerId).toBeNull();
    expect(ctx.localCallStream).toBeNull();
  });

  it('does NOT end the current call if an unrelated party disconnects', () => {
    // Đang gọi video với peer_1, nhưng ông peer_2 trong background tự nhiên F5
    ctx.callState = 'in_call';
    ctx.callPeerId = 'peer_1';
    ctx.localCallStream = { getTracks: () => [] } as unknown as MediaStream;

    cleanupPeer('peer_2');

    // Trạng thái vẫn tiếp tục giữ nguyên với peer_1
    expect(ctx.callState).toBe('in_call');
    expect(ctx.callPeerId).toBe('peer_1');
    expect(ctx.localCallStream).not.toBeNull();
  });

  it('cleans up incoming files from the disconnected peer', () => {
    ctx.incomingFiles.set('file_abc', {
      meta: {
        id: 'file_abc',
        senderId: 'peer_1',
        name: 'test.bin',
        size: 100,
        mimeType: 'application/octet-stream',
        totalChunks: 1
      },
      chunks: [],
      receivedChunks: new Set(),
      senderPeerId: 'peer_1',
      isPendingDownload: false,
      lastProgressUpdate: Date.now()
    });

    cleanupPeer('peer_1');

    expect(ctx.incomingFiles.has('file_abc')).toBe(false);
  });

  it('removes peer from outgoing file tracking, but keeps file entry to allow F5 re-download', () => {
    ctx.outgoingFiles.set('file_xyz', {
      file: new File([], 'test.zip'),
      meta: {
        id: 'file_xyz',
        senderId: 'me',
        name: 'test.zip',
        size: 100,
        mimeType: 'application/zip',
        totalChunks: 1
      },
      chunks: [],
      ackedChunks: new Set(),
      peerAcked: new Map([['peer_1', new Set()]]),
      targetPeers: new Set(['peer_1']),
      downloadRequestedPeers: new Set(['peer_1'])
    });

    cleanupPeer('peer_1');

    // targetPeers empty → outgoing entry should STILL BE KEPT so peer can reconnect and download
    expect(ctx.outgoingFiles.has('file_xyz')).toBe(true);

    // Verify peer tracking is wiped
    const outgoing = ctx.outgoingFiles.get('file_xyz')!;
    expect(outgoing.targetPeers.has('peer_1')).toBe(false);
    expect(outgoing.peerAcked.has('peer_1')).toBe(false);
    expect(outgoing.downloadRequestedPeers?.has('peer_1')).toBe(false);
  });

  it('keeps outgoing file when other peer still remain as targets', () => {
    ctx.outgoingFiles.set('file_multi', {
      file: new File([], 'big.zip'),
      meta: {
        id: 'file_multi',
        senderId: 'me',
        name: 'big.zip',
        size: 200,
        mimeType: 'application/zip',
        totalChunks: 2
      },
      chunks: [],
      ackedChunks: new Set(),
      peerAcked: new Map([
        ['peer_1', new Set()],
        ['peer_2', new Set()]
      ]),
      targetPeers: new Set(['peer_1', 'peer_2'])
    });

    cleanupPeer('peer_1');

    // peer_2 still needs the file
    expect(ctx.outgoingFiles.has('file_multi')).toBe(true);
    const outgoing = ctx.outgoingFiles.get('file_multi')!;
    expect(outgoing.targetPeers.has('peer_1')).toBe(false);
    expect(outgoing.targetPeers.has('peer_2')).toBe(true);
  });
});

describe('Screen Share Resumption & Media Stream Lifecycle', () => {
  beforeEach(() => {
    ctx.peer = [];
    ctx.connections.clear();
    ctx.callState = 'idle';
    ctx.localMediaStream = null;
    ctx.remoteMediaStreams = {};
    // @ts-expect-error - Mock RTCPeerConnection for setupPeerConnection
    globalThis.RTCPeerConnection = vi.fn().mockImplementation(createMockPc);
  });

  afterEach(() => {
    delete (globalThis as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
  });

  it('automatically attaches localMediaStream to a newly connecting peer (e.g. B hits F5 and reconnects to A)', async () => {
    const { setupPeerConnection } = await import('./peerConnection');

    // Giả lập máy A đang phát Screen Share
    const mockTrack = { kind: 'video' } as MediaStreamTrack;
    ctx.localMediaStream = {
      getTracks: () => [mockTrack]
    } as unknown as MediaStream;

    // Lắng nghe xem RTCPeerConnection có được tạo và gắn track vào không
    setupPeerConnection('peer_B', 'Bob', false);

    const pc = ctx.connections.get('peer_B');
    expect(pc).toBeDefined();
    expect(pc!.addTrack).toHaveBeenCalledWith(mockTrack, ctx.localMediaStream);
  });

  it('does NOT attach localMediaStream if A is busy in a Voice/Video call', async () => {
    const { setupPeerConnection } = await import('./peerConnection');

    const mockTrack = { kind: 'video' } as MediaStreamTrack;
    ctx.localMediaStream = {
      getTracks: () => [mockTrack]
    } as unknown as MediaStream;
    ctx.callState = 'in_call';

    setupPeerConnection('peer_C', 'Charlie', false);

    const pc = ctx.connections.get('peer_C');
    // Vì đang call (chứ không phải screen share pure), chống rò rỉ hình/tiếng sang người C
    expect(pc!.addTrack).not.toHaveBeenCalled();
  });

  it('stops stream and cleans up completely when A stops sharing or F5 (mất nguồn)', async () => {
    const { stopScreenShare } = await import('./peerConnection');

    const mockTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    ctx.localMediaStream = {
      getTracks: () => [mockTrack]
    } as unknown as MediaStream;

    const mockSender = { track: mockTrack };
    const mockPc = {
      close: vi.fn(),
      getSenders: vi.fn().mockReturnValue([mockSender]),
      removeTrack: vi.fn()
    } as unknown as RTCPeerConnection;
    ctx.connections.set('peer_B', mockPc);

    // Kích hoạt dừng (giả lập A dừng share hoặc A Refresh mất Context)
    stopScreenShare();

    // Track gốc trên máy A phải bị stop
    expect(mockTrack.stop).toHaveBeenCalledOnce();
    // Track đang bơm sang máy B phải bị gỡ ra
    expect(mockPc.removeTrack).toHaveBeenCalledWith(mockSender);
    // Source stream bị set null
    expect(ctx.localMediaStream).toBeNull();
  });

  it('blocks Media Streams from C (enforcing privacy) if A and B are already in a video call', async () => {
    const { setupPeerConnection } = await import('./peerConnection');

    // A và B đang gọi nhau
    ctx.callState = 'in_call';
    ctx.callPeerId = 'peer_B';

    // Ông C nhảy vào (C bật Screen Share cho vào Group chung)
    setupPeerConnection('peer_C', 'Charlie', false);
    const pcC = ctx.connections.get('peer_C')!;

    // Giả lập WebRTC bắn sự kiện ontrack từ ông C
    const mockTrack = { kind: 'video' } as MediaStreamTrack;
    const mockStream = {
      addTrack: vi.fn(),
      getTracks: () => [mockTrack]
    } as unknown as MediaStream;

    // Cấp MediaStream giả vì Node.js không có MediaStream class native
    globalThis.MediaStream = vi.fn().mockImplementation(() => mockStream);

    // Kích hoạt nhận track
    pcC.ontrack!({ track: mockTrack, streams: [mockStream] } as unknown as RTCTrackEvent);

    // Xác nhận:
    // 1. Luồng stream của C BỊ TỪ CHỐI không được add vào remoteMediaStreams
    expect(ctx.remoteMediaStreams['peer_C']).toBeUndefined();

    // 2. Trạng thái call của A và B KHÔNG hề bị đè hoặc bị rớt
    expect(ctx.callState).toBe('in_call');
    expect(ctx.callPeerId).toBe('peer_B');

    // Dọn dẹp mock
    delete (globalThis as unknown as { MediaStream?: unknown }).MediaStream;
  });

  it('blocks incoming streams if A is sharing their own screen', async () => {
    const { setupPeerConnection } = await import('./peerConnection');

    // Màn A đang share screen (tự share)
    ctx.localMediaStream = { getTracks: () => [] } as unknown as MediaStream;

    setupPeerConnection('peer_C', 'Charlie', false);
    const pcC = ctx.connections.get('peer_C')!;

    const mockTrack = { kind: 'video' } as MediaStreamTrack;
    const mockStream = {
      addTrack: vi.fn(),
      getTracks: () => [mockTrack]
    } as unknown as MediaStream;
    globalThis.MediaStream = vi.fn().mockImplementation(() => mockStream);

    // C dội ngược stream vào A
    pcC.ontrack!({ track: mockTrack, streams: [mockStream] } as unknown as RTCTrackEvent);

    // A từ chối nhận
    expect(ctx.remoteMediaStreams['peer_C']).toBeUndefined();

    delete (globalThis as unknown as { MediaStream?: unknown }).MediaStream;
  });

  it("blocks incoming streams if A is already watching B's screen", async () => {
    const { setupPeerConnection } = await import('./peerConnection');

    // Màn A đang bận xem stream của B
    ctx.remoteMediaStreams = { peer_B: {} as MediaStream };

    setupPeerConnection('peer_C', 'Charlie', false);
    const pcC = ctx.connections.get('peer_C')!;

    const mockTrack = { kind: 'video' } as MediaStreamTrack;
    const mockStream = {
      addTrack: vi.fn(),
      getTracks: () => [mockTrack]
    } as unknown as MediaStream;
    globalThis.MediaStream = vi.fn().mockImplementation(() => mockStream);

    // C dội stream vào A
    pcC.ontrack!({ track: mockTrack, streams: [mockStream] } as unknown as RTCTrackEvent);

    // A từ chối nhận của C, vẫn giữ nguyên của B
    expect(ctx.remoteMediaStreams['peer_C']).toBeUndefined();
    expect(ctx.remoteMediaStreams['peer_B']).toBeDefined();

    delete (globalThis as unknown as { MediaStream?: unknown }).MediaStream;
  });
});

describe('Voice / Video Call Methods', () => {
  beforeEach(() => {
    ctx.callState = 'idle';
    ctx.callPeerId = null;
    ctx.localCallStream = null;

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }] // Mock stream
        })
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('declines a call and resets state', async () => {
    const { declineCall } = await import('./peerConnection');
    const { sendChat } = await import('$lib/features/webrtc/dataChannel');

    ctx.callState = 'ringing';
    ctx.callPeerId = 'peer_1';

    declineCall();

    expect(sendChat).toHaveBeenCalledWith({
      type: 'system',
      systemEvent: 'callDeclined',
      peerId: 'peer_1'
    });
    expect(ctx.callState).toBe('idle');
    expect(ctx.callPeerId).toBeNull();
  });

  it('ends a call and resets state', async () => {
    const { endCall } = await import('./peerConnection');
    const { sendChat } = await import('$lib/features/webrtc/dataChannel');

    ctx.callState = 'in_call';
    ctx.callPeerId = 'peer_1';

    // Giả lập stream camera để xác nhận kết thúc có dọn dẹp không
    const mockTrack = { stop: vi.fn(), kind: 'audio' };
    ctx.localCallStream = { getTracks: () => [mockTrack] } as unknown as MediaStream;

    endCall();

    expect(sendChat).toHaveBeenCalledWith({
      type: 'system',
      systemEvent: 'callEnded',
      peerId: 'peer_1'
    });
    expect(ctx.callState).toBe('idle');
    expect(ctx.callPeerId).toBeNull();
    expect(mockTrack.stop).toHaveBeenCalledOnce(); // Kiểm tra camera bị tắt
    expect(ctx.localCallStream).toBeNull();
  });
});
