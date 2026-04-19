<script lang="ts">
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { searchMessages } from '$lib/core/db';
  import type { StoredChatMessage } from '$lib/core/db';
  import { log } from '$lib/core/logger';
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import UserAvatar from '$lib/shared/components/UserAvatar.svelte';

  let keyword = $state('');
  let searchResults = $state<StoredChatMessage[]>([]);

  function autoFocus(node: HTMLInputElement) {
    node.focus();
  }

  async function performSearch() {
    if (!chatStore.selectedPeerId) return;
    if (keyword.trim() === '') {
      searchResults = [];
      return;
    }
    try {
      searchResults = await searchMessages(chatStore.selectedPeerId, keyword);
    } catch (e) {
      log.db.error('Error searching messages:', e);
      toast.error(i18n.t('searchError'));
    }
  }

  function handleMessageClick(msgId: string) {
    chatStore.scrollToMessageId = msgId;
  }

  function goBackToOverview() {
    chatStore.sidebarView = 'overview';
  }
</script>

<div class="header">
  <button class="icon-btn" onclick={goBackToOverview}><CloseIcon size={20} /></button>
  <input
    type="text"
    class="search-input"
    placeholder={i18n.t('searchKeywordPlaceholder')}
    bind:value={keyword}
    oninput={performSearch}
    use:autoFocus
  />
</div>
<div class="content scroll-y">
  {#if searchResults.length > 0}
    <div class="list">
      {#each searchResults as msg (msg.id)}
        <button class="msg-item" onclick={() => handleMessageClick(msg.id)}>
          <div class="msg-item-header">
            <UserAvatar name={msg.senderName} userId={msg.senderId} size={32} />
            <div class="msg-item-info">
              <span class="sender-name">{msg.senderName}</span>
              <span class="time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
          <p class="msg-text">{msg.text}</p>
        </button>
      {/each}
    </div>
  {:else if keyword.trim()}
    <p class="empty-text">{i18n.t('noSearchResults')}</p>
  {:else}
    <p class="empty-text">{i18n.t('enterToSearch')}</p>
  {/if}
</div>

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--glass-border);
    gap: 0.5rem;
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
  .search-input {
    flex: 1;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    border: 1px solid var(--glass-border);
    background: rgba(var(--color-black-rgb), 0.02);
    color: var(--text-main);
    outline: none;
    font-size: 0.9rem;
    &:focus {
      border-color: var(--color-indigo-500);
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
  .msg-item {
    background: rgba(var(--color-black-rgb), 0.02);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    padding: 1rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    &:hover {
      background: rgba(var(--color-black-rgb), 0.05);
      transform: translateY(-1px);
    }

    .msg-item-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .msg-item-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .sender-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-main);
      display: block;
    }

    .time {
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .msg-text {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      padding-left: 2px;
    }
  }
  .empty-text {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
    margin: 1rem 0;
  }
</style>
