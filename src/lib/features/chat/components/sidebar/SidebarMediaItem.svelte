<script lang="ts">
  import type { StoredChatMessage } from '$lib/core/db';
  import { blobCache } from '$lib/core/blobCache';
  import { onDestroy } from 'svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';

  interface Props {
    msg: StoredChatMessage;
    onClick: (msg: StoredChatMessage, url?: string) => void;
  }
  let { msg, onClick }: Props = $props();

  let localUrl = $state<string | undefined>();
  let hasAcquired = false;

  $effect(() => {
    if (!hasAcquired && msg.file) {
      hasAcquired = true;
      blobCache.acquire(msg.id).then((url) => {
        if (url) localUrl = url;
      });
    }
  });

  onDestroy(() => {
    if (hasAcquired) {
      blobCache.release(msg.id);
    }
  });
  let isImage = $derived(localUrl && msg.file?.mimeType?.startsWith('image/'));
  let isVideo = $derived(localUrl && msg.file?.mimeType?.startsWith('video/'));
</script>

{#if isImage}
  <button class="media-item" onclick={() => onClick(msg, localUrl)}>
    <img src={localUrl} alt={msg.file?.name} loading="lazy" />
  </button>
{:else if isVideo}
  <button
    class="media-item"
    onclick={() => onClick(msg, localUrl)}
    aria-label={msg.file?.name || i18n.t('attachmentVideo')}
    title={msg.file?.name}
  >
    <video src="{localUrl}#t=0.1" muted preload="metadata"></video>
  </button>
{:else}
  <button class="media-item doc-item" onclick={() => onClick(msg, localUrl)}>
    <span class="ext-name">{i18n.t('attachmentFile')}</span>
  </button>
{/if}

<style lang="scss">
  .media-item {
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    padding: 0;
    background: rgba(var(--color-gray-500-rgb), 0.1);
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(var(--color-black-rgb), 0.1);
      border-color: var(--accent-color);
    }

    img,
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    &.doc-item {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(var(--color-gray-500-rgb), 0.1);

      .ext-name {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
      }
    }
  }
</style>
