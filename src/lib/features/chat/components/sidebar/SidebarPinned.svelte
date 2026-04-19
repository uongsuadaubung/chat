<script lang="ts">
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { getPinnedMessages } from '$lib/core/db';
  import type { StoredChatMessage } from '$lib/core/db';
  import { log } from '$lib/core/logger';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { getMessagePreviewText } from '$lib/features/chat/util';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import FileIcon from '$lib/shared/components/icons/FileIcon.svelte';
  import UserAvatar from '$lib/shared/components/UserAvatar.svelte';

  let pinnedMessages = $state<StoredChatMessage[]>([]);

  async function loadData() {
    if (!chatStore.selectedPeerId) return;
    try {
      const myId = ctx.currentUser?.id;
      let rawPinned = await getPinnedMessages(chatStore.selectedPeerId);

      if (myId) {
        rawPinned = rawPinned.filter((m) => !m.hiddenFromPeers?.includes(myId));
      }
      pinnedMessages = rawPinned;
    } catch (e) {
      log.db.error('Error loading sidebar pinned data:', e);
      toast.error(i18n.t('pinLoadError'));
    }
  }

  let debounceTimeout: ReturnType<typeof setTimeout>;
  function debouncedLoadData() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadData();
    }, 200);
  }

  $effect(() => {
    const peerId = chatStore.selectedPeerId;

    // React to changes in messages that might affect pinned status
    if (peerId && webrtc.messages[peerId]) {
      // Track any message property changes that could affect pinned display
      webrtc.messages[peerId].forEach((m) => {
        return m.isDeleted || m.isPinned || m.hiddenFromPeers || m.updatedAt;
      });
    }

    if (peerId) {
      debouncedLoadData();
    }
  });

  function handleMessageClick(msgId: string) {
    chatStore.scrollToMessageId = msgId;
  }

  function unpinMessage(e: Event, msgId: string) {
    e.stopPropagation();
    if (chatStore.selectedPeerId) {
      webrtc.pinMessage(msgId, false, chatStore.selectedPeerId);
    }
  }

  function goBackToOverview() {
    chatStore.sidebarView = 'overview';
  }
</script>

<div class="header">
  <button class="icon-btn" onclick={goBackToOverview}><CloseIcon size={20} /></button>
  <h3>{i18n.t('pinnedMessages')} ({pinnedMessages.length})</h3>
</div>
<div class="content scroll-y">
  {#if pinnedMessages.length > 0}
    <div class="list">
      {#each pinnedMessages as msg (msg.id)}
        <div class="msg-card">
          <button class="card-body" onclick={() => handleMessageClick(msg.id)}>
            <UserAvatar name={msg.senderName} userId={msg.senderId} size={36} />
            <div class="card-content">
              <div class="card-header">
                <span class="sender-name">{msg.senderName}</span>
                <span class="time"
                  >{new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span
                >
              </div>
              <p class="msg-text">
                {#if msg.type === 'file' || msg.file}
                  <FileIcon size={14} />
                  {getMessagePreviewText(msg)}
                  {#if msg.text}
                    <span class="caption-preview"
                      >: {msg.text.length > 30 ? msg.text.substring(0, 30) + '...' : msg.text}</span
                    >
                  {/if}
                {:else}
                  {msg.text}
                {/if}
              </p>
            </div>
          </button>
          <button
            class="unpin-action"
            onclick={(e) => unpinMessage(e, msg.id)}
            title={i18n.t('unpin')}
          >
            <CloseIcon size={14} />
            {i18n.t('unpin')}
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty-text">{i18n.t('noPinnedMessages')}</p>
  {/if}
</div>

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--glass-border);
    gap: 0.5rem;
    h3 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-main);
      flex: 1;
      margin: 0;
    }
  }
  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-main);
    padding: 0.4rem;
    border-radius: 8px;
    display: flex;
    &:hover {
      background: rgba(var(--color-black-rgb), 0.05);
    }
  }
  .content {
    flex: 1;
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .scroll-y {
    overflow-y: auto;
    padding: 1rem;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .empty-text {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
    margin: 1rem 0;
  }

  .msg-card {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 3px rgba(var(--color-black-rgb), 0.02);
    margin-bottom: 0.5rem;
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(var(--color-black-rgb), 0.05);
      border-color: rgba(var(--color-indigo-500-rgb), 0.3);
    }
    .card-body {
      display: flex;
      padding: 12px;
      gap: 12px;
      background: transparent;
      border: none;
      width: 100%;
      text-align: left;
      cursor: pointer;
    }

    .card-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
      .sender-name {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-main);
      }
      .time {
        font-size: 0.7rem;
        color: var(--text-muted);
      }
    }
    .msg-text {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      display: flex;
      align-items: center;
      gap: 6px;

      .caption-preview {
        opacity: 0.8;
        font-style: italic;
      }
    }
  }
  .unpin-action {
    background: transparent;
    border: none;
    border-top: 1px dashed var(--glass-border);
    color: var(--error-color);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 8px;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    &:hover {
      background: rgba(var(--color-red-500-rgb), 0.05);
    }
  }
</style>
