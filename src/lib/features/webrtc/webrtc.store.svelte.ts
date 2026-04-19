import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { joinRoom, leaveRoom } from '$lib/features/webrtc/room';
import {
  sendChat,
  type SendChatParams,
  sendFile,
  requestDownload,
  cancelDownload,
  sendTyping,
  syncMessages,
  editMessage,
  deleteMessage,
  reactMessage,
  sendReadReceiptBatch,
  pinMessage
} from '$lib/features/webrtc/dataChannel';
import {
  loadHistoryAroundMessage,
  resetToPresent,
  loadOlderMessages
} from '$lib/features/webrtc/dataChannels/messageChannel';
import {
  retryConnection,
  startScreenShare,
  stopScreenShare,
  startCall,
  acceptCall,
  declineCall,
  endCall
} from '$lib/features/webrtc/peerConnection';
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';

/**
 * WebRTC Store — Điểm truy cập duy nhất cho UI.
 * Store chỉ quản lý reactive state + expose public API.
 * Toàn bộ business logic nằm trong services/.
 */
function createWebrtcStore() {
  return {
    // === Reactive Stores (dùng trong Svelte components) ===
    get messages() {
      return ctx.messages;
    },
    get viewingHistoryForRoom() {
      return ctx.viewingHistoryForRoom;
    },
    get peer() {
      return ctx.peer;
    },
    get typingUsers() {
      return ctx.typingUsers;
    },
    get localMediaStream() {
      return ctx.localMediaStream;
    },
    get localCallStream() {
      return ctx.localCallStream;
    },
    get remoteMediaStreams() {
      return ctx.remoteMediaStreams;
    },
    get callState() {
      return ctx.callState;
    },
    get callPeerId() {
      return ctx.callPeerId;
    },
    get callIsIncoming() {
      return ctx.callIsIncoming;
    },
    get callWithVideo() {
      return ctx.callWithVideo;
    },

    // === Public API ===
    joinRoom: (roomId: string, user: { id: string; name: string }, password?: string) => {
      atomicActionManager.cleanupOldTransactions().catch((e) => {
        console.error('Failed to cleanup old transactions:', e);
      });
      return joinRoom(roomId, user, password);
    },
    sendChat: (params: SendChatParams) => sendChat(params),
    sendFile: (file: File, peerId: string, caption?: string) => sendFile(file, peerId, caption),
    requestDownload: (fileId: string, peerId: string) => requestDownload(fileId, peerId),
    cancelDownload: (fileId: string, peerId: string) => cancelDownload(fileId, peerId),
    sendTypingStatus: (isTyping: boolean, peerId: string) => sendTyping(isTyping, peerId),
    editMessage: (messageId: string, newText: string, peerId: string) =>
      editMessage(messageId, newText, peerId),
    deleteMessage: (messageId: string, peerId: string, syncGlobal: boolean = true) =>
      deleteMessage(messageId, peerId, syncGlobal),
    reactMessage: (messageId: string, reaction: string, peerId: string) =>
      reactMessage(messageId, reaction, peerId),
    pinMessage: (messageId: string, isPinned: boolean, peerId: string) =>
      pinMessage(messageId, isPinned, peerId),
    syncMessages: (peerId: string) => syncMessages(peerId),
    retryConnection: (peerId: string) => retryConnection(peerId),
    startScreenShare: (withAudio: boolean = false) => startScreenShare(withAudio),
    stopScreenShare: () => stopScreenShare(),
    startCall: (peerId: string, withVideo: boolean = false) => startCall(peerId, withVideo),
    acceptCall: () => acceptCall(),
    declineCall: () => declineCall(),
    endCall: () => endCall(),
    leaveRoom: () => {
      return leaveRoom();
    },
    markAsRead: (peerId: string) => {
      const readMsgIds: string[] = [];
      const m = ctx.messages;
      if (!m[peerId]) return;
      let changed = false;
      const updated = m[peerId].map((msg) => {
        if (!msg.isSelf && !msg.read) {
          changed = true;
          readMsgIds.push(msg.id);
          return { ...msg, read: true };
        }
        return msg;
      });
      if (changed) {
        ctx.messages = { ...m, [peerId]: updated };
      }
      // Báo cáo lại cho người gửi trong 1 batch signal duy nhất (tránh N+1 spam)
      sendReadReceiptBatch(readMsgIds, peerId);
    },
    loadHistoryAroundMessage: (messageId: string, peerId: string) =>
      loadHistoryAroundMessage(messageId, peerId),
    resetToPresent: (peerId: string) => resetToPresent(peerId),
    loadOlderMessages: (peerId: string) => loadOlderMessages(peerId)
  };
}

export const webrtc = createWebrtcStore();

// Tránh rò rỉ listener Firebase khi Vite Hot Reload (HMR)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    webrtc.leaveRoom();
  });
}
