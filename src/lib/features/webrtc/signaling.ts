import { db, ref, set, push } from '$lib/core/firebase';
import type { Signal, SignalPayload } from '$lib/type';
import { isPolite, shouldInitiate } from '$lib/core/util';
import { log } from '$lib/core/logger';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import {
  flushPendingCandidates,
  cleanupPeer,
  setupPeerConnection
} from '$lib/features/webrtc/peerConnection';

// ========================
// GỬI TÍN HIỆU QUA FIREBASE
// ========================

export function sendSignal(receiverId: string, payload: SignalPayload) {
  if (!ctx.currentRoomId || !ctx.currentUser) {
    log.signal.warn(
      `BLOCKED: roomId=${ctx.currentRoomId}, user=${ctx.currentUser?.id}, type=${payload?.type}`
    );
    return;
  }
  const signalRef = push(ref(db, `${ctx.signalPath}/${receiverId}`));
  set(signalRef, {
    senderId: ctx.currentUser.id,
    timestamp: Date.now(),
    ...payload
  }).catch((err) => log.signal.warn('Lỗi gửi signal:', err));
}

// ========================
// XỬ LÝ TÍN HIỆU NHẬN ĐƯỢC
// ========================

export async function handleSignal(peerId: string, signal: Signal) {
  if (signal.type === 'reconnect_req') {
    log.webrtc.info(
      `Nhận yêu cầu reconnect_req từ ${peerId}, đang tái thiết lập kết nối (Đồng bộ F5-less)...`
    );
    cleanupPeer(peerId);
    if (ctx.currentUser) {
      const peerName = ctx.peer.find((p) => p.id === peerId)?.name || 'Unknown';
      setupPeerConnection(peerId, peerName, shouldInitiate(ctx.currentUser.id, peerId));
    }
    return;
  }

  const pc = ctx.connections.get(peerId);
  if (!pc) {
    log.webrtc.debug(`Tín hiệu đến sớm cho ${peerId}, đưa vào hàng chờ.`);
    const queue = ctx.earlySignals.get(peerId) || [];
    queue.push(signal);
    ctx.earlySignals.set(peerId, queue);
    return;
  }

  try {
    if (signal.type === 'offer') {
      log.webrtc.info(`Nhận offer từ ${peerId}`);

      // === Perfect Negotiation: Xử lý Glare (offer collision) ===
      if (!ctx.currentUser) return;
      const polite = isPolite(ctx.currentUser.id, peerId);
      const offerCollision = pc.signalingState !== 'stable' || ctx.makingOfferFor.has(peerId);

      if (offerCollision) {
        if (!polite) {
          // Impolite peer: giữ offer của chính mình, bỏ qua offer đối phương
          log.glare.warn(`Impolite peer — bỏ qua offer collision với ${peerId}`);
          return;
        }
        // Polite peer: rollback offer của mình, chấp nhận offer đối phương
        log.glare.info(`Polite peer — rollback offer, chấp nhận offer từ ${peerId}`);
      }

      await pc.setRemoteDescription({ type: signal.sdp.type!, sdp: signal.sdp.sdp! });

      // Xả hàng đợi ICE candidates đã đến trước offer
      await flushPendingCandidates(peerId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log.webrtc.info(`Đã tạo & gửi answer tới ${peerId}`);
      sendSignal(peerId, {
        type: 'answer',
        sdp: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp }
      });
    } else if (signal.type === 'answer') {
      log.webrtc.info(`Nhận answer từ ${peerId}`);
      // Chỉ chấp nhận answer khi đang chờ (have-local-offer)
      if (pc.signalingState !== 'have-local-offer') {
        log.webrtc.warn(`Bỏ qua answer vì signalingState = ${pc.signalingState}`);
        return;
      }
      await pc.setRemoteDescription({ type: signal.sdp.type!, sdp: signal.sdp.sdp! });

      // Xả hàng đợi ICE candidates đã đến trước answer
      await flushPendingCandidates(peerId);
    } else if (signal.type === 'candidate') {
      if (!signal.candidate || !signal.candidate.candidate) return;

      // Nếu chưa có remoteDescription → xếp vào hàng đợi, KHÔNG vứt bỏ
      if (!pc.remoteDescription) {
        const queue = ctx.pendingCandidates.get(peerId) || [];
        queue.push(signal.candidate);
        ctx.pendingCandidates.set(peerId, queue);
        return;
      }

      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  } catch (err: unknown) {
    log.webrtc.warn(`Lỗi xử lý signal type=${signal.type}:`, err);
  }
}
