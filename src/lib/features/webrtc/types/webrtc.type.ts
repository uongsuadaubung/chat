import type { SvelteMap } from 'svelte/reactivity';
import type { ChatMessage, PeerUser, FileTransferMeta } from '$lib/features/chat/types/chat.type';
import type { Signal } from '$lib/features/webrtc/types/signal.type';

export interface IncomingFile {
  meta: FileTransferMeta;
  chunks: Uint8Array[]; // Store binary chunks
  receivedChunks: Set<number>;
  senderPeerId: string; // để biết gửi file_download_req về đâu
  isPendingDownload?: boolean; // chờ user bấm Download
  blobUrl?: string;
  lastProgressUpdate?: number;
  lastRateUpdate?: number;
  lastRateBytes?: number;
  currentRate?: number;
}

export interface OutgoingFile {
  file: File;
  meta: FileTransferMeta;
  chunks: Uint8Array[];
  ackedChunks: Set<number>;
  peerAcked: Map<string, Set<number>>; // peerId -> acked chunk indices
  targetPeers: Set<string>;
  downloadRequestedPeers?: Set<string>; // peer que já solicitaram download
  lastAckProgressUpdate?: number;
  lastRateUpdate?: number;
  lastRateBytes?: number;
  currentRate?: number;
  isCancelled?: boolean;
  isPaused?: boolean;
  startedAt?: number;
  completedAt?: number;
}

export interface ProgressUpdate {
  progress: number;
  url?: string;
  complete?: boolean;
  error?: string;
  rate?: number;
}

/**
 * WebRTCContext — State chia sẻ giữa các service.
 */
export interface WebRTCContext {
  // === Reactive Stores (UI binding) ===
  messages: Record<string, ChatMessage[]>;
  peer: PeerUser[];
  typingUsers: SvelteMap<string, number>;
  /** Stream màn hình đang chia sẻ (screen share). Null khi không share. */
  localMediaStream: MediaStream | null;
  /** Stream mic/camera của cuộc gọi voice/video. Null khi không trong call. */
  localCallStream: MediaStream | null;
  remoteMediaStreams: Record<string, MediaStream>;

  // === Call States ===
  callState: 'idle' | 'ringing' | 'in_call';
  callPeerId: string | null;
  callIsIncoming: boolean;
  callWithVideo: boolean;

  // === Session State ===
  currentRoomId: string | null;
  signalPath: string | null;
  currentUser: { id: string; name: string } | null;

  // === WebRTC Internals ===
  connections: Map<string, RTCPeerConnection>;
  dataChannels: Map<string, RTCDataChannel>;
  unsubscribes: (() => void)[];

  // === File Transfers ===
  incomingFiles: Map<string, IncomingFile>;
  outgoingFiles: Map<string, OutgoingFile>;

  // === Queues ===
  /** ICE candidates chờ remoteDescription được set */
  pendingCandidates: Map<string, RTCIceCandidateInit[]>;
  /** Signals đến sớm khi chưa khởi tạo PeerConnection */
  earlySignals: Map<string, Signal[]>;

  // === Perfect Negotiation ===
  /** Peer IDs đang trong quá trình tạo offer */
  makingOfferFor: Set<string>;
}
