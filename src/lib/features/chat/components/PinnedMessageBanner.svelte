<script lang="ts">
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { getPinnedMessages } from '$lib/core/db';
  import type { StoredChatMessage } from '$lib/core/db';
  import PinIcon from '$lib/shared/components/icons/PinIcon.svelte';
  import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { clickOutside } from '$lib/shared/actions/clickOutside';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { getMessagePreviewText } from '$lib/features/chat/util';

  let pinnedMessages = $state<StoredChatMessage[]>([]);
  let isMenuOpen = $state(false);

  // Reaction to webrtc.messages changing or selectedPeerId changing
  $effect(() => {
    const peerId = chatStore.selectedPeerId;

    // Add reactive dependency on messages array to auto-reload when pin state changes
    if (peerId && webrtc.messages[peerId]) {
      webrtc.messages[peerId].forEach((m) => {
        return m.isPinned || m.isDeleted || m.hiddenFromPeers;
      });
    }

    if (peerId) {
      getPinnedMessages(peerId)
        .then((allPinned) => {
          let filteredPinned = allPinned;
          const myId = ctx.currentUser?.id;
          if (myId) {
            filteredPinned = allPinned.filter((m) => !m.hiddenFromPeers?.includes(myId));
          }

          // Lưu danh sách theo thứ tự mới nhất (đảo ngược mảng)
          pinnedMessages = [...filteredPinned].reverse();
        })
        .catch(() => {
          pinnedMessages = [];
        });
    } else {
      pinnedMessages = [];
      isMenuOpen = false;
    }
  });

  const currentMsg = $derived(pinnedMessages[0]);

  function handleMainClick() {
    if (currentMsg) {
      chatStore.scrollToMessageId = currentMsg.id;
    }
  }

  function toggleMenu(e: Event) {
    e.stopPropagation();
    isMenuOpen = !isMenuOpen;
  }

  function handleSelectItem(msg: StoredChatMessage) {
    chatStore.scrollToMessageId = msg.id;
    isMenuOpen = false;
  }
</script>

{#if currentMsg}
  <div class="banner-container" use:clickOutside={() => (isMenuOpen = false)}>
    <div
      class="pinned-banner"
      role="button"
      tabindex="0"
      onclick={handleMainClick}
      onkeydown={(e) => e.key === 'Enter' && handleMainClick()}
    >
      <div class="icon"><PinIcon size={18} /></div>
      <div class="banner-content">
        <div class="title-row">
          <span class="title">{i18n.t('pinnedMessages')}</span>
          {#if pinnedMessages.length > 1}
            <button class="expand-btn" onclick={toggleMenu} aria-label={i18n.t('showAll')}>
              <span class="count">{pinnedMessages.length}</span>
              <span class="chevron" class:open={isMenuOpen}>▼</span>
            </button>
          {/if}
        </div>
        <span class="preview-text">
          {getMessagePreviewText(currentMsg)}
        </span>
      </div>
    </div>

    {#if isMenuOpen}
      <div class="dropdown-list">
        {#each pinnedMessages as msg (msg.id)}
          <button class="list-item" onclick={() => handleSelectItem(msg)}>
            <div class="sender-row">
              <span class="sender">{msg.senderName}</span>
              <span class="time"
                >{new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span
              >
            </div>
            <span class="text">
              {getMessagePreviewText(msg)}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .banner-container {
    position: relative;
    width: 100%;
    z-index: 20;
    flex-shrink: 0;
  }

  .pinned-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--glass-bg);
    border-bottom: 1px solid var(--glass-border);
    border-top: none;
    border-left: none;
    border-right: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.2s;

    &:hover {
      background: rgba(var(--color-black-rgb), 0.02);
    }

    .icon {
      color: var(--color-indigo-500);
      display: flex;
    }

    .banner-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2px;
    }

    .title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-indigo-500);
    }

    .expand-btn {
      background: rgba(var(--color-black-rgb), 0.05);
      border: none;
      border-radius: 12px;
      padding: 2px 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      pointer-events: auto;

      &:hover {
        background: rgba(var(--color-indigo-500-rgb), 0.1);
      }

      .count {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--color-indigo-500);
      }

      .chevron {
        font-size: 0.55rem;
        color: var(--color-indigo-500);
        transition: transform 0.2s;

        &.open {
          transform: rotate(180deg);
        }
      }
    }

    .preview-text {
      font-size: 0.85rem;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .dropdown-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--glass-bg);
    border-bottom: 1px solid var(--glass-border);
    box-shadow: 0 4px 6px -1px rgba(var(--color-black-rgb), 0.1);
    max-height: 300px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    z-index: 30;
    backdrop-filter: blur(8px);

    .list-item {
      display: flex;
      flex-direction: column;
      padding: 10px 16px;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(var(--color-black-rgb), 0.05);
      text-align: left;
      cursor: pointer;

      &:hover {
        background: rgba(var(--color-black-rgb), 0.03);
      }

      &:last-child {
        border-bottom: none;
      }

      .sender-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
      }

      .sender {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-indigo-500);
      }

      .time {
        font-size: 0.65rem;
        color: var(--text-muted);
      }

      .text {
        font-size: 0.85rem;
        color: var(--text-main);
        white-space: pre-wrap;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    }
  }
</style>
