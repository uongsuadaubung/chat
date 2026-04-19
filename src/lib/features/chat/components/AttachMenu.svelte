<script lang="ts">
  import { onMount } from 'svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import PlusIcon from '$lib/shared/components/icons/PlusIcon.svelte';
  import ImageIcon from '$lib/shared/components/icons/ImageIcon.svelte';
  import FileIcon from '$lib/shared/components/icons/FileIcon.svelte';
  import ScreenShareIcon from '$lib/shared/components/icons/ScreenShareIcon.svelte';

  interface Props {
    onImageSelect: () => void;
    onFileSelect: () => void;
    onScreenShareSelect?: () => void;
    isScreenShareDisabled?: boolean;
    isScreenSharing?: boolean;
    hideScreenShare?: boolean;
  }
  let {
    onImageSelect,
    onFileSelect,
    onScreenShareSelect,
    isScreenShareDisabled,
    isScreenSharing,
    hideScreenShare = false
  }: Props = $props();

  let showMenu = $state(false);
  let hasScreenShareSupport = $state(false);

  onMount(() => {
    hasScreenShareSupport =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      'getDisplayMedia' in navigator.mediaDevices;
  });

  function toggleMenu() {
    showMenu = !showMenu;
  }

  export function closeMenu() {
    showMenu = false;
  }

  function handleImage() {
    showMenu = false;
    onImageSelect();
  }

  function handleFile() {
    showMenu = false;
    onFileSelect();
  }

  function handleScreenShare() {
    showMenu = false;
    if (onScreenShareSelect) onScreenShareSelect();
  }
  import { clickOutside } from '$lib/shared/actions/clickOutside';
</script>

<div class="attach-container" use:clickOutside={closeMenu}>
  <button class="attach-btn" aria-label={i18n.t('attachOptions')} onclick={toggleMenu}>
    <PlusIcon />
  </button>

  {#if showMenu}
    <div class="attach-menu">
      <button class="menu-item" onclick={handleImage}>
        <span class="icon"><ImageIcon size="18" /></span>
        {i18n.t('attachImage')}
      </button>
      <button class="menu-item" onclick={handleFile}>
        <span class="icon"><FileIcon size="18" /></span>
        {i18n.t('attachFile')}
      </button>
      {#if hasScreenShareSupport && !hideScreenShare}
        <button
          class="menu-item"
          class:disabled={isScreenShareDisabled && !isScreenSharing}
          class:active={isScreenSharing}
          onclick={handleScreenShare}
        >
          <span class="icon"><ScreenShareIcon size="18" /></span>
          {#if isScreenSharing}
            {i18n.t('stopScreenShare')}
          {:else}
            {i18n.t('shareScreen')}
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .attach-container {
    position: relative;
    display: flex;
    align-items: center;

    .attach-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      transition: all 0.2s;
      margin-right: 8px;

      &:hover {
        background: rgba(var(--color-gray-500-rgb), 0.1);
        color: var(--accent-color);
      }
    }

    .attach-menu {
      position: absolute;
      bottom: calc(100% + 15px);
      left: 0;
      background: var(--glass-bg);
      -webkit-backdrop-filter: var(--glass-blur);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: 0 10px 25px rgba(var(--color-black-rgb), 0.15);
      z-index: 100;
      min-width: 220px;
      animation: popUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);

      .menu-item {
        background: transparent;
        border: none;
        text-align: left;
        padding: 10px 12px;
        border-radius: 8px;
        color: var(--text-main);
        font-size: 0.95rem;
        cursor: pointer;
        transition: background 0.15s;
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 500;

        .icon {
          font-size: 1.1rem;
        }

        &:hover:not(.disabled) {
          background: rgba(var(--color-blue-500-rgb), 0.1);
          color: var(--accent-color);
        }

        &.active {
          color: var(--color-red-500);
          background: rgba(var(--color-red-500-rgb), 0.1);
          &:hover {
            background: rgba(var(--color-red-500-rgb), 0.2);
          }
        }

        &.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }
    }
  }

  @keyframes popUp {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
