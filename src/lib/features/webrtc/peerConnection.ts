import {
  ICE_CONFIG,
  MAX_ICE_RETRIES,
  RETRY_SOCKET_DRAIN_MS
} from '$lib/features/webrtc/webrtc.constant';
import { shouldInitiate } from '$lib/core/util';
import { log } from '$lib/core/logger';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { sendSignal, handleSignal } from '$lib/features/webrtc/signaling';
import { setupDataChannel, sendChat } from '$lib/features/webrtc/dataChannel';
import { updatePeerStatus, removePeer } from '$lib/features/webrtc/peer';
import { appSettings, SCREEN_SHARE_PROFILES } from '$lib/shared/stores/appSettings.store.svelte';
import { toast } from '$lib/shared/stores/toast.store.svelte';
import { i18n } from '$lib/features/i18n/i18n.store.svelte';
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';

// ========================
// ICE CANDIDATE — Xả hàng đợi khi remoteDescription đã sẵn sàng
// ========================

export async function flushPendingCandidates(peerId: string) {
  const pc = ctx.connections.get(peerId);
  if (!pc || !pc.remoteDescription) return;

  const queue = ctx.pendingCandidates.get(peerId);
  if (!queue || queue.length === 0) return;

  // Lấy hết ra và xóa queue
  const candidates = queue.splice(0, queue.length);
  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err: unknown) {
      log.ice.warn('Bỏ qua ICE candidate lỗi:', err);
    }
  }
}

// ========================
// XẢ TÍN HIỆU ĐẾN SỚM
// ========================

function flushEarlySignals(peerId: string) {
  const pending = ctx.earlySignals.get(peerId);
  if (pending && pending.length > 0) {
    ctx.earlySignals.delete(peerId);
    log.webrtc.debug(`Khôi phục ${pending.length} tín hiệu bị chờ cho ${peerId}`);
    for (const sig of pending) handleSignal(peerId, sig);
  }
}

// ========================
// CLEANUP MỘT PEER CỤ THỂ
// ========================

export function cleanupPeer(peerId: string) {
  const pc = ctx.connections.get(peerId);
  if (pc) {
    pc.close();
    ctx.connections.delete(peerId);
  }
  ctx.dataChannels.delete(peerId);
  ctx.pendingCandidates.delete(peerId);
  ctx.earlySignals.delete(peerId);

  // --- HỦY CUỘC GỌI NẾU ĐỐI TÁC RỜI ĐI ---
  if (ctx.callPeerId === peerId && ctx.callState !== 'idle') {
    log.webrtc.warn(`Cuộc gọi tự động kết thúc do ${peerId} rời phòng hoặc F5.`);
    toast.error(i18n.t('callConnectionLost'));
    resetCallState();
  }

  // --- DỌN RÁC INCOMING FILES (Tránh rò rỉ RAM Máy Nhận) ---
  for (const [fileId, incoming] of ctx.incomingFiles.entries()) {
    if (incoming.senderPeerId === peerId && !incoming.isPendingDownload) {
      ctx.incomingFiles.delete(fileId);
      log.webrtc.info(`Dọn rác file đang nhận dở ${fileId} từ ${peerId}`);
    }
  }

  // --- DỌN RÁC OUTGOING FILES (Chỉ xóa trạng thái của peer, giữ lại file gửi để hỗ trợ F5) ---
  for (const outgoing of ctx.outgoingFiles.values()) {
    if (outgoing.targetPeers.has(peerId)) {
      outgoing.targetPeers.delete(peerId);
      outgoing.peerAcked.delete(peerId);
      outgoing.downloadRequestedPeers?.delete(peerId);
      // Không gọi `ctx.outgoingFiles.delete(fileId)` ở đây nữa
      // Việc giải phóng file gốc sẽ được quản lý bởi messageChannel dựa trên vòng đời tin nhắn (thùng rác / quá số lượng)
    }
  }

  removePeer(peerId);
}

// ========================
// SETUP PEER CONNECTION
// ========================

export function setupPeerConnection(peerId: string, peerName: string, isInitiator: boolean) {
  // Nếu đã có kết nối rồi, không tạo lại
  if (ctx.connections.has(peerId)) return;

  const pc = new RTCPeerConnection(ICE_CONFIG);
  ctx.connections.set(peerId, pc);
  ctx.pendingCandidates.set(peerId, []);

  // Xả tín hiệu đến sớm — gọi ngay sau khi PC sẵn sàng (event-driven)
  queueMicrotask(() => flushEarlySignals(peerId));

  // === Media Tracks (Video/Audio) ===
  pc.ontrack = (event) => {
    // --- CHỐNG XÂM NHẬP: Bỏ qua stream mồi từ C nếu A đang bận ---
    // 1. Phục vụ cuộc gọi 1-1
    if (ctx.callState !== 'idle' && ctx.callPeerId !== peerId) {
      log.webrtc.warn(`Từ chối nhận track từ ${peerId} (Đang bận gọi với ${ctx.callPeerId})`);
      return;
    }

    // 2. Chống dội ngược rác khi A đang tự Stream màn hình mình (chỉ nói chuyện rỗng, không nhận stream)
    if (ctx.localMediaStream !== null) {
      log.webrtc.warn(`Từ chối nhận track từ ${peerId} (Đang trình chiếu màn hình của chính mình)`);
      return;
    }

    // 3. Đang xem Stream của người B thì không cho người C nhảy vào gây lag / loạn màn hình
    const existingRemoteIds = Object.keys(ctx.remoteMediaStreams);
    if (existingRemoteIds.length > 0 && !existingRemoteIds.includes(peerId)) {
      log.webrtc.warn(
        `Từ chối nhận track từ ${peerId} (Đang bận xem luồng stream từ ${existingRemoteIds.join(', ')})`
      );
      return;
    }

    log.webrtc.info(`Nhận track ${event.track.kind} từ ${peerId}`);

    let stream: MediaStream;
    if (event.streams && event.streams.length > 0) {
      stream = event.streams[0];
    } else {
      stream = ctx.remoteMediaStreams[peerId] || new MediaStream();
      stream.addTrack(event.track);
    }

    const handleTrackEnd = () => {
      if (!event.streams || !event.streams.length) {
        stream.removeTrack(event.track);
      }
      if (stream.getTracks().length === 0) {
        const newS = { ...ctx.remoteMediaStreams };
        delete newS[peerId];
        ctx.remoteMediaStreams = newS;
      }
    };

    // Chỉ dùng onended — onmute fire khi mất gói tin tạm thời, không phải kết thúc stream
    event.track.onended = handleTrackEnd;

    ctx.remoteMediaStreams = { ...ctx.remoteMediaStreams, [peerId]: stream };
  };

  // === Đẩy Media Tracks Nếu Đang Share Màn Hình (Cho TH user F5 hoặc join muộn) ===
  // Guard: chỉ push khi đang screen share (callState === 'idle'), không push call stream sang peer lạ
  const localStream = ctx.localMediaStream;
  if (localStream && ctx.callState === 'idle') {
    log.webrtc.info(`Tiếp tục share màn hình hiện tại cho user mới/vừa reconnect: ${peerName}`);
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  // === ICE Candidate ===
  pc.onicecandidate = (event) => {
    if (event.candidate && event.candidate.candidate) {
      log.ice.debug(`Gửi candidate tới ${peerId}`);
      sendSignal(peerId, {
        type: 'candidate',
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        }
      });
    }
  };

  // === Connection State ===
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    log.webrtc.info(`Trạng thái kết nối với ${peerName}: ${state}`);
    if (state === 'connected') {
      updatePeerStatus(peerId, peerName, true, false);
      // Tự động hóa Cơ chế Retry: Quét outbox và retry các tác vụ đang treo
      atomicActionManager.processOutboxForPeer(peerId);
    } else if (state === 'failed') {
      updatePeerStatus(peerId, peerName, false, true);
    } else if (state === 'disconnected' || state === 'closed') {
      updatePeerStatus(peerId, peerName, false);
      if (ctx.callPeerId === peerId) {
        log.webrtc.warn(`Ngắt cuộc gọi do mất kết nối WebRTC với ${peerName}`);
        toast.error(i18n.t('callConnectionLost'));
        resetCallState();
      }
    }
  };

  // === ICE Connection State (backup detection + retry với backoff + auto-reconnect) ===
  let iceRetryCount = 0;
  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    log.ice.info(`Trạng thái với ${peerName}: ${state}`);
    if (state === 'connected' || state === 'completed') {
      iceRetryCount = 0; // Reset khi thành công
      // Giải phóng bộ nhớ — queue không còn cần thiết sau khi kết nối thành công
      ctx.pendingCandidates.delete(peerId);
      ctx.earlySignals.delete(peerId);
      updatePeerStatus(peerId, peerName, true, false); // force clear hasFailed
    } else if (state === 'failed') {
      if (iceRetryCount < MAX_ICE_RETRIES) {
        iceRetryCount++;
        const delay = iceRetryCount * 1000; // Backoff: 1s, 2s, 3s
        log.ice.warn(
          `Failed cho ${peerName}, retry ${iceRetryCount}/${MAX_ICE_RETRIES} sau ${delay}ms...`
        );
        setTimeout(() => pc.restartIce(), delay);
        updatePeerStatus(peerId, peerName, false); // omit hasFailed to preserve or keep intermediate
      } else {
        // Dừng vòng lặp: Hết lượt retry cho phép, kết nối thất bại hoàn toàn.
        // Yêu cầu người dùng chủ động tải lại ứng dụng.
        log.ice.error(
          `Hết lượt retry cho ${peerName}, kết nối P2P thất bại hoàn toàn! Vui lòng tải lại trang.`
        );
        updatePeerStatus(peerId, peerName, false, true); // explicitly set failed
        if (ctx.callPeerId === peerId) {
          toast.error(i18n.t('callConnectionLost'));
          resetCallState();
        }
      }
    } else if (state === 'disconnected' || state === 'closed') {
      updatePeerStatus(peerId, peerName, false);
      if (ctx.callPeerId === peerId) {
        toast.error(i18n.t('callConnectionLost'));
        resetCallState();
      }
    }
  };

  // === negotiationneeded — Perfect Negotiation Pattern ===
  pc.onnegotiationneeded = async () => {
    try {
      ctx.makingOfferFor.add(peerId);
      const offer = await pc.createOffer();
      // Kiểm tra signalingState vẫn stable — tránh race condition
      if (pc.signalingState !== 'stable') {
        log.negotiation.warn(`Hủy offer vì signalingState=${pc.signalingState}`);
        return;
      }
      await pc.setLocalDescription(offer);
      sendSignal(peerId, {
        type: 'offer',
        sdp: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp }
      });
    } catch (err: unknown) {
      log.negotiation.warn('Lỗi tạo offer:', err);
    } finally {
      ctx.makingOfferFor.delete(peerId);
    }
  };

  // === Initiator: Tạo DataChannel (sẽ trigger negotiationneeded tự động) ===
  if (isInitiator) {
    const dc = pc.createDataChannel('chat');
    setupDataChannel(peerId, dc);
  } else {
    // === Non-initiator: Chờ nhận DataChannel ===
    pc.ondatachannel = (event) => {
      setupDataChannel(peerId, event.channel);
    };
  }
}

// ========================
// RECONNECT PEER MANUALLY
// ========================
export function retryConnection(peerId: string) {
  if (!ctx.currentUser) return;
  const peer = ctx.peer;
  const peerName = peer.find((p) => p.id === peerId)?.name || 'Unknown';

  log.ice.info(`Người dùng yêu cầu thử kết nối lại định tuyến tĩnh với ${peerName}`);
  cleanupPeer(peerId);
  updatePeerStatus(peerId, peerName, false, false);

  // Đánh thức peer bên kia (nếu họ không ấn nút gì) để thiết lập lại kết nối đồng loạt
  sendSignal(peerId, { type: 'reconnect_req' });

  // Trì hoãn một chút để giải phóng cổng socket network cũ
  setTimeout(() => {
    if (ctx.currentUser) {
      setupPeerConnection(peerId, peerName, shouldInitiate(ctx.currentUser.id, peerId));
    }
  }, RETRY_SOCKET_DRAIN_MS);
}

// ========================
// MEDIA: SCREEN SHARING
// ========================

export async function startScreenShare(withAudio: boolean = false) {
  try {
    const settings = appSettings.settings;
    const isMotion = settings.screenShareProfile === SCREEN_SHARE_PROFILES.MOTION;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: isMotion
        ? true
        : {
            frameRate: { ideal: 15, max: 30 } // Giới hạn FPS để giảm tải băng thông/encoder cho Detail
          },
      audio: withAudio
    });

    const videoTrack = stream.getVideoTracks()[0];
    videoTrack.onended = () => {
      stopScreenShare();
    };

    // Gợi ý cho bộ mã hóa WebRTC
    if ('contentHint' in videoTrack) {
      videoTrack.contentHint = isMotion ? 'motion' : 'detail';
    }

    ctx.localMediaStream = stream;

    // Add tracks to all peer
    const tracks = stream.getTracks();
    for (const track of tracks) {
      for (const [peerId, pc] of ctx.connections.entries()) {
        try {
          pc.addTrack(track, stream);
        } catch (e) {
          log.webrtc.warn(`Lỗi thêm track vào ${peerId}`, e);
        }
      }
    }

    ctx.connections.forEach((_, peerId) => {
      sendChat({ type: 'system', systemEvent: 'screenShareStart', peerId: peerId });
    });

    log.webrtc.info('Bắt đầu chia sẻ màn hình');
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      log.webrtc.info('Người dùng từ chối chia sẻ màn hình.');
      return; // không throw — expected behavior
    }
    log.webrtc.error('Lỗi khi chia sẻ màn hình:', err);
    throw err;
  }
}

export function stopScreenShare() {
  const stream = ctx.localMediaStream;
  if (!stream) return;

  const tracks = stream.getTracks();
  for (const track of tracks) {
    track.stop();
    for (const pc of ctx.connections.values()) {
      const senders = pc.getSenders();
      const sender = senders.find((s: RTCRtpSender) => s.track === track);
      if (sender) {
        pc.removeTrack(sender);
      }
    }
  }

  ctx.localMediaStream = null;

  ctx.connections.forEach((_, peerId) => {
    sendChat({ type: 'system', systemEvent: 'screenShareStop', peerId: peerId });
  });

  log.webrtc.info('Đã dừng chia sẻ màn hình');
}

// ========================
// MEDIA: VOICE / VIDEO CALL
// ========================

export async function startCall(peerId: string, withVideo: boolean = false) {
  // Guard chống double-call: nếu đang ringing/in_call thì bỏ qua
  if (ctx.callState !== 'idle') return;

  try {
    // Nếu đang chia sẻ màn hình thì dừng trước khi gọi
    // An toàn vì giờ stopScreenShare() chỉ đụng localMediaStream, không liên quan call state
    if (ctx.localMediaStream) {
      stopScreenShare();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: withVideo,
      audio: true
    });
    ctx.localCallStream = stream;
    ctx.callState = 'ringing';
    ctx.callPeerId = peerId;
    ctx.callIsIncoming = false;
    ctx.callWithVideo = withVideo;

    // Add tracks to the target peer
    const pc = ctx.connections.get(peerId);
    if (pc) {
      const tracks = stream.getTracks();
      for (const track of tracks) {
        pc.addTrack(track, stream);
      }
    }

    sendChat({
      type: 'system',
      systemEvent: 'callOffer',
      peerId: peerId,
      text: withVideo ? 'video' : 'voice' // abusing text to send video/voice context
    });
    log.webrtc.info(`Đã gửi yêu cầu gọi tới ${peerId}`);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      log.webrtc.warn('Người dùng từ chối permission gọi.');
      toast.error(i18n.t('callPermissionDenied'));
    } else if (err instanceof DOMException && err.name === 'NotFoundError') {
      log.webrtc.warn('Không tìm thấy thiết bị gọi.');
      toast.error(i18n.t('micError') + 'No camera/mic found.');
    } else {
      log.webrtc.error('Lỗi khi bắt đầu gọi:', err);
      toast.error(typeof err === 'object' && err ? err.toString() : 'Call error');
    }
    resetCallState();
    throw err;
  }
}

export async function acceptCall() {
  const peerId = ctx.callPeerId;
  if (!peerId) return;

  try {
    // Nếu đang share màn hình mà nhận call luôn thì ưu tiên Call.
    // An toàn hoàn toàn: stopScreenShare() chỉ đụng ctx.localMediaStream,
    // không đụng callPeerId/callIsIncoming/callState nữa.
    if (ctx.localMediaStream) {
      stopScreenShare();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: ctx.callWithVideo,
      audio: true
    });
    ctx.localCallStream = stream;
    ctx.callState = 'in_call';

    const pc = ctx.connections.get(peerId);
    if (!pc) {
      // PeerConnection mất trước khi accept — từ chối thay vì stuck in_call
      log.webrtc.warn(`acceptCall: không tìm thấy PeerConnection cho ${peerId}`);
      toast.error(i18n.t('callConnectionLost'));
      declineCall();
      return;
    }

    const tracks = stream.getTracks();
    for (const track of tracks) {
      pc.addTrack(track, stream);
    }

    sendChat({ type: 'system', systemEvent: 'callAccepted', peerId: peerId });
    log.webrtc.info('Đã nhận cuộc gọi');
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      log.webrtc.warn('Người dùng từ chối permission nhận cuộc gọi.');
      toast.error(i18n.t('callPermissionDenied'));
    } else if (err instanceof DOMException && err.name === 'NotFoundError') {
      log.webrtc.warn('Không tìm thấy thiết bị gọi.');
      toast.error(i18n.t('micError') + 'No camera/mic found.');
    } else {
      log.webrtc.error('Lỗi khi nhận cuộc gọi:', err);
      toast.error(typeof err === 'object' && err ? err.toString() : 'Call accept error');
    }
    declineCall();
    throw err;
  }
}

export function declineCall() {
  const peerId = ctx.callPeerId;
  if (peerId) {
    sendChat({ type: 'system', systemEvent: 'callDeclined', peerId: peerId });
  }
  resetCallState();
}

export function endCall() {
  const peerId = ctx.callPeerId;
  if (peerId) {
    sendChat({ type: 'system', systemEvent: 'callEnded', peerId: peerId });
  }
  resetCallState();
}

export function resetCallState() {
  const stream = ctx.localCallStream;
  if (stream) {
    const tracks = stream.getTracks();
    for (const track of tracks) {
      track.stop();
      for (const pc of ctx.connections.values()) {
        const senders = pc.getSenders();
        const sender = senders.find((s: RTCRtpSender) => s.track === track);
        if (sender) pc.removeTrack(sender);
      }
    }
  }
  ctx.remoteMediaStreams = {};
  ctx.localCallStream = null;
  ctx.callState = 'idle';
  ctx.callPeerId = null;
  ctx.callIsIncoming = false;
  ctx.callWithVideo = false;
  log.webrtc.info('Đã dọn dẹp trạng thái cuộc gọi');
}
