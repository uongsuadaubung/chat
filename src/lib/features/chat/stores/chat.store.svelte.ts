import type { ChatMessage } from '$lib/type';

class ChatStore {
  selectedPeerId = $state<string | null>(null);
  replyingToMessage = $state<ChatMessage | null>(null);
  editingMessage = $state<ChatMessage | null>(null);
  showSidebar = $state(false);
  showRightSidebar = $state(false);
  sidebarView = $state<'overview' | 'search' | 'pinned'>('overview');
  scrollToMessageId = $state<string | null>(null);

  setReply(msg: ChatMessage | null) {
    this.replyingToMessage = msg;
    this.editingMessage = null;
  }

  setEdit(msg: ChatMessage | null) {
    this.editingMessage = msg;
    this.replyingToMessage = null;
  }

  selectPeer(id: string | null) {
    this.selectedPeerId = id;
    this.showSidebar = false;
    this.showRightSidebar = false; // Let's close it on switch to avoid confusion
    this.sidebarView = 'overview';
    this.scrollToMessageId = null;
    this.replyingToMessage = null;
    this.editingMessage = null;
  }
}

export const chatStore = new ChatStore();
