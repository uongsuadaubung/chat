<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import type { ChatMessage } from '$lib/type';
  import DotsIcon from '$lib/shared/components/icons/DotsIcon.svelte';
  import ReplyIcon from '$lib/shared/components/icons/ReplyIcon.svelte';
  import SmileIcon from '$lib/shared/components/icons/SmileIcon.svelte';
  import { QUICK_REACTIONS } from '$lib/features/chat/constants/emoji.constant';

  interface Props {
    message: ChatMessage;
    onReply?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onUnsend?: () => void;
    onPin?: () => void;
    onReactClick?: (emoji: string) => void;
  }
  let { message, onReply, onEdit, onDelete, onUnsend, onPin, onReactClick }: Props = $props();

  let showMenu = $state(false);
  let showReactMenu = $state(false);

  function toggleMenu(e: Event) {
    e.stopPropagation();
    showMenu = !showMenu;
    showReactMenu = false;
  }

  function toggleReactMenu(e: Event) {
    e.stopPropagation();
    showReactMenu = !showReactMenu;
    showMenu = false;
  }

  function closeMenu() {
    showMenu = false;
    showReactMenu = false;
  }
  import { clickOutside } from '$lib/shared/actions/clickOutside';
</script>

<div
  class="actions-container"
  use:clickOutside={closeMenu}
  class:is-self={message.isSelf}
  class:menu-open={showMenu || showReactMenu}
>
  <button class="action-btn" onclick={onReply} title={i18n.t('reply')}
    ><ReplyIcon size={16} /></button
  >
  {#if !message.isSelf}
    <div class="menu-wrapper">
      <button class="action-btn" onclick={toggleReactMenu} title={i18n.t('react')}
        ><SmileIcon size={16} /></button
      >
      {#if showReactMenu}
        <div
          class="react-menu"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => {
            if (e.key === 'Escape') showReactMenu = false;
            e.stopPropagation();
          }}
          role="menu"
          tabindex="-1"
        >
          {#each QUICK_REACTIONS as emoji (emoji)}
            <button
              class="react-item"
              onclick={() => {
                showReactMenu = false;
                onReactClick?.(emoji);
              }}
            >
              {emoji}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="menu-wrapper">
    <button class="action-btn" onclick={toggleMenu} title={i18n.t('moreOptions')}
      ><DotsIcon size={16} /></button
    >
    {#if showMenu}
      <div
        class="dropdown-menu"
        class:align-right={message.isSelf}
        class:align-left={!message.isSelf}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => {
          if (e.key === 'Escape') showMenu = false;
          e.stopPropagation();
        }}
        role="menu"
        tabindex="-1"
      >
        {#if message.isSelf}
          {#if message.type === 'text'}
            <button
              class="menu-item"
              onclick={() => {
                showMenu = false;
                onEdit?.();
              }}>{i18n.t('edit')}</button
            >
          {/if}
          <button
            class="menu-item"
            onclick={() => {
              showMenu = false;
              onPin?.();
            }}>{message.isPinned ? i18n.t('unpin') : i18n.t('pinMessage')}</button
          >
          <button
            class="menu-item text-danger"
            onclick={() => {
              showMenu = false;
              onUnsend?.();
            }}>{i18n.t('unsend')}</button
          >
          <button
            class="menu-item text-danger"
            onclick={() => {
              showMenu = false;
              onDelete?.();
            }}>{i18n.t('deleteForMe')}</button
          >
        {:else}
          <button
            class="menu-item"
            onclick={() => {
              showMenu = false;
              onPin?.();
            }}>{message.isPinned ? i18n.t('unpin') : i18n.t('pinMessage')}</button
          >
          <button
            class="menu-item text-danger"
            onclick={() => {
              showMenu = false;
              onDelete?.();
            }}>{i18n.t('deleteForMe')}</button
          >
        {/if}
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .actions-container {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
    padding: 0 8px;

    &.is-self {
      flex-direction: row-reverse;
    }

    &.menu-open {
      opacity: 1;
    }

    @media (hover: none), (max-width: 768px) {
      opacity: 1;
    }
  }

  :global(.message-outer-wrapper:hover) .actions-container {
    opacity: 1;
  }

  .action-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 6px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;

    &:hover {
      background: var(--glass-bg);
      color: var(--text-main);
    }
  }

  .menu-wrapper {
    position: relative;
  }

  .react-menu {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-radius: 30px;
    padding: 6px 10px;
    box-shadow: 0 4px 12px rgba(var(--color-black-rgb), 0.15);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 8px;

    .react-item {
      background: transparent;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0;
      transition: transform 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        transform: scale(1.3);
      }
    }
  }

  .dropdown-menu {
    position: absolute;
    bottom: 100%;
    margin-bottom: 4px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-radius: 8px;
    padding: 4px;
    min-width: 120px;
    box-shadow: 0 4px 12px rgba(var(--color-black-rgb), 0.15);
    z-index: 100;
    display: flex;
    flex-direction: column;

    &.align-right {
      right: 0;
    }
    &.align-left {
      left: 0;
    }
  }

  .menu-item {
    background: transparent;
    border: none;
    text-align: left;
    padding: 8px 12px;
    font-size: 0.9rem;
    color: var(--text-main);
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;

    &:hover {
      background: rgba(var(--color-gray-500-rgb), 0.2);
    }

    &.text-danger {
      color: var(--error-color);
      &:hover {
        background: rgba(var(--color-red-500-rgb), 0.1);
      }
    }
  }
</style>
