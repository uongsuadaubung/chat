import {
  db,
  ref,
  set,
  get,
  onChildAdded,
  onChildRemoved,
  remove,
  onDisconnect
} from '$lib/core/firebase';
import { isValidSignal, shouldInitiate } from '$lib/core/util';
import { log } from '$lib/core/logger';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { setupPeerConnection, cleanupPeer } from '$lib/features/webrtc/peerConnection';
import { loadAllHistoryFromDB } from '$lib/features/webrtc/dataChannels/messageChannel';
import { updatePeerStatus } from '$lib/features/webrtc/peer';
import { handleSignal } from '$lib/features/webrtc/signaling';

// ========================
// JOIN ROOM
// ========================

export async function joinRoom(
  roomId: string,
  user: { id: string; name: string },
  password?: string
) {
  // Nếu đang ở trong phòng khác, thoát trước
  if (ctx.currentRoomId) {
    await leaveRoom();
  }

  ctx.currentRoomId = roomId;
  ctx.currentUser = user;

  // Tải lại lịch sử chat ngầm từ IndexedDB
  try {
    await loadAllHistoryFromDB();
  } catch (err: unknown) {
    log.room.error('Lỗi tải lịch sử:', err);
  }

  let path = `signals/${roomId}`;
  if (password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    path = `signals/${roomId}_${hashHex}`;
  }
  ctx.signalPath = path;

  // 1. Dọn sạch signals cũ trước khi nghe
  const mySignalsRef = ref(db, `${ctx.signalPath}/${user.id}`);
  await remove(mySignalsRef);

  // 2. Đăng ký presence (hiện diện) trong phòng
  const myPresenceRef = ref(db, `rooms/${roomId}/users/${user.id}`);
  await set(myPresenceRef, { name: user.name, joinedAt: Date.now() });
  onDisconnect(myPresenceRef).remove();

  // 3. Lắng nghe người dùng THAM GIA phòng
  const usersRef = ref(db, `rooms/${roomId}/users`);
  const unsubUsersAdded = onChildAdded(usersRef, (snapshot) => {
    const peerId = snapshot.key;
    if (!peerId || peerId === user.id) return;

    const peerData = snapshot.val();
    const peerName = peerData?.name || 'Unknown';
    updatePeerStatus(peerId, peerName, false);

    // Dùng pure function shouldInitiate() — dễ test, dễ hiểu
    setupPeerConnection(peerId, peerName, shouldInitiate(user.id, peerId));
  });
  ctx.unsubscribes.push(unsubUsersAdded);

  // 4. Lắng nghe người dùng RỜI phòng
  const unsubUsersRemoved = onChildRemoved(usersRef, (snapshot) => {
    const peerId = snapshot.key;
    if (!peerId || peerId === user.id) return;
    cleanupPeer(peerId);
  });
  ctx.unsubscribes.push(unsubUsersRemoved);

  // 5. Lắng nghe tín hiệu gửi đến cho mình
  const unsubSignals = onChildAdded(mySignalsRef, (snapshot) => {
    const data = snapshot.val();

    // Runtime validation — dữ liệu từ Firebase không đáng tin
    if (!isValidSignal(data)) {
      log.signal.warn('Signal không hợp lệ, bỏ qua:', data);
      remove(snapshot.ref).catch((e) => log.signal.warn('Failed to remove invalid signal:', e));
      return;
    }

    // Xóa signal ngay sau khi đọc
    remove(snapshot.ref).catch((e) => log.signal.warn('Failed to remove processed signal:', e));

    handleSignal(data.senderId, data);
  });
  ctx.unsubscribes.push(unsubSignals);
}

// ========================
// LEAVE ROOM
// ========================

export async function leaveRoom() {
  const leavingRoomId = ctx.currentRoomId;
  const leavingUser = ctx.currentUser;
  const leavingSignalPath = ctx.signalPath;

  // Reset state TRƯỚC khi await — ngăn joinRoom() bị ảnh hưởng
  ctx.currentRoomId = null;
  ctx.signalPath = null;
  ctx.currentUser = null;

  // 1. Gỡ tất cả Firebase listeners TRƯỚC để không nhận thêm signal
  ctx.unsubscribes.forEach((unsub) => unsub());
  ctx.unsubscribes.length = 0;

  // 2. Đóng tất cả kết nối WebRTC
  ctx.connections.forEach((pc) => pc.close());
  ctx.connections.clear();
  ctx.dataChannels.clear();
  ctx.pendingCandidates.clear();
  ctx.earlySignals.clear();

  // --- Dọn dẹp Zombie Files ---
  ctx.incomingFiles.clear();
  ctx.outgoingFiles.clear();

  // 3. Reset UI state
  ctx.messages = {};
  ctx.peer = [];

  // 4. Dọn Firebase (async, không block)
  if (leavingUser && leavingRoomId && leavingSignalPath) {
    try {
      await remove(ref(db, `rooms/${leavingRoomId}/users/${leavingUser.id}`));
      remove(ref(db, `${leavingSignalPath}/${leavingUser.id}`)).catch((e) =>
        log.room.warn('Failed to clean up signals channel:', e)
      );

      // Kiểm tra phòng rỗng — dùng transaction-style: đọc + xóa có điều kiện
      const usersSnap = await get(ref(db, `rooms/${leavingRoomId}/users`)).catch((e) => {
        log.room.error('Failed to get users list for room cleanup:', e);
        return null;
      });
      if (!usersSnap || !usersSnap.exists()) {
        remove(ref(db, `rooms/${leavingRoomId}`)).catch(() =>
          log.room.debug('Bỏ qua xóa nhánh rooms/ (bị chặn bởi Firebase Rules)')
        );
        remove(ref(db, leavingSignalPath)).catch(() =>
          log.room.debug('Bỏ qua xóa nhánh signals/ (bị chặn bởi Firebase Rules)')
        );
        log.room.info(`Phòng ${leavingRoomId} trống, đã tự động dọn nhánh cá nhân.`);
      }
    } catch (err: unknown) {
      log.room.warn('Lỗi dọn dẹp khi rời phòng:', err);
    }
  }
}
