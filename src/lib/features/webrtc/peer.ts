import { COLORS } from '$lib/features/webrtc/webrtc.constant';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';

// ========================
// HELPER — Tạo màu cho user
// ========================

function getColorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

// ========================
// CẬP NHẬT TRẠNG THÁI PEER
// ========================

export function updatePeerStatus(
  id: string,
  name: string,
  connected: boolean,
  hasFailed?: boolean
) {
  const p = ctx.peer;
  const idx = p.findIndex((x) => x.id === id);
  if (idx !== -1) {
    // Svelte 5 Reactivity Core: Phải sao chép Object ra reference mới để giao diện tự render lại
    const newArray = [...p];
    newArray[idx] = {
      ...p[idx],
      connected,
      name,
      ...(hasFailed !== undefined ? { hasFailed } : {})
    };
    ctx.peer = newArray;
  } else {
    ctx.peer = [
      ...p,
      { id, name, color: getColorForUser(id), connected, hasFailed: hasFailed ?? false }
    ];
  }
}

export function removePeer(id: string) {
  ctx.peer = ctx.peer.filter((x) => x.id !== id);
}
