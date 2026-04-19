/**
 * Pure utility functions — Tách ra ngoài closure của webrtcStore để dễ unit test.
 * Không có side effect, không phụ thuộc vào state bên ngoài.
 */

import type { Signal } from '$lib/type';

import { SignalSchema } from '$lib/features/webrtc/types/signal.type';

/** Kiểm tra runtime xem dữ liệu từ Firebase có đúng format Signal không */
export function isValidSignal(data: unknown): data is Signal {
  return SignalSchema.safeParse(data).success;
}

/** Peer nào là "polite" trong Perfect Negotiation (ID lớn hơn → polite, sẵn sàng nhường) */
export function isPolite(myId: string, peerId: string): boolean {
  return myId > peerId;
}

/** Peer nào là initiator — gửi offer trước (ID nhỏ hơn → initiator) */
export function shouldInitiate(myId: string, peerId: string): boolean {
  return myId < peerId;
}

/** Định dạng dung lượng byte thành dạng đọc được (KB, MB, GB,...) */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const dec = 1;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dec)) + ' ' + sizes[i];
}

/** Định dạng số giây sang chuẩn hiển thị x hrs y mins z secs */
export function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
}
