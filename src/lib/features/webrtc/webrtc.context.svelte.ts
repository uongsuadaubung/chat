import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type {
  ChatMessage,
  IncomingFile,
  OutgoingFile,
  PeerUser,
  Signal,
  WebRTCContext
} from '$lib/type';

/**
 * WebRTC Globals / Context
 * Nguồn dữ liệu duy nhất (Single Source of Truth) cho trạng thái mạng WebRTC.
 */
class WebRTCState implements WebRTCContext {
  messages: Record<string, ChatMessage[]> = $state({});
  viewingHistoryForRoom: Record<string, boolean> = $state({});
  peer: PeerUser[] = $state([]);
  typingUsers: SvelteMap<string, number> = new SvelteMap();
  /** Stream màn hình đang chia sẻ (screen share). Null khi không share. */
  localMediaStream: MediaStream | null = $state(null);
  /** Stream mic/camera của cuộc gọi voice/video. Null khi không trong call. */
  localCallStream: MediaStream | null = $state(null);
  remoteMediaStreams: Record<string, MediaStream> = $state({});

  // Call States
  callState: 'idle' | 'ringing' | 'in_call' = $state('idle');
  callPeerId: string | null = $state(null);
  callIsIncoming: boolean = $state(false);
  callWithVideo: boolean = $state(false);

  currentRoomId: string | null = null;
  signalPath: string | null = null;
  currentUser: { id: string; name: string } | null = null;
  connections = new SvelteMap<string, RTCPeerConnection>();
  dataChannels = new SvelteMap<string, RTCDataChannel>();
  unsubscribes: (() => void)[] = [];
  incomingFiles = new SvelteMap<string, IncomingFile>();
  outgoingFiles = new SvelteMap<string, OutgoingFile>();
  pendingCandidates = new SvelteMap<string, RTCIceCandidateInit[]>();
  earlySignals = new SvelteMap<string, Signal[]>();
  makingOfferFor = new SvelteSet<string>();
}

export const ctx = new WebRTCState();
