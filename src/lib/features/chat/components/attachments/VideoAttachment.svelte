<script lang="ts">
  import type { ChatMessage } from '$lib/type';
  import { formatFileSize } from '$lib/core/util';
  import VideoIcon from '$lib/shared/components/icons/VideoIcon.svelte';
  import TransferProgress from '$lib/features/chat/components/attachments/TransferProgress.svelte';
  import FileAttachment from '$lib/features/chat/components/attachments/FileAttachment.svelte';
  import { blobCache } from '$lib/core/blobCache';
  import { onDestroy } from 'svelte';

  interface Props {
    message: ChatMessage;
    onPreview: (url: string) => void;
  }
  let { message, onPreview }: Props = $props();

  let localUrl = $state<string | undefined>();
  let hasAcquired = false;

  $effect(() => {
    if (
      !hasAcquired &&
      message.file &&
      !message.file.isPendingDownload &&
      !message.file.isReceiving
    ) {
      hasAcquired = true;
      blobCache.acquire(message.id).then((url) => {
        if (url) localUrl = url;
      });
    }
  });

  onDestroy(() => {
    if (hasAcquired) {
      blobCache.release(message.id);
    }
  });
  let isOwnSentFile = $derived(
    message.isSelf && !message.file?.isReceiving && !message.file?.isPendingDownload
  );
</script>

{#if isOwnSentFile}
  <!-- Sender video -->
  {#if localUrl}
    <button
      type="button"
      class="video-button-wrapper"
      onclick={() => localUrl && onPreview(localUrl)}
      aria-label={`Preview ${message.file?.name}`}
    >
      <video
        src="{localUrl}#t=0.1"
        class="previewable-video"
        title="{message.file?.name} - {formatFileSize(message.file?.size || 0)}"
        preload="metadata"
      >
        <track kind="captions" />
      </video>
    </button>
  {:else}
    <div class="image-skeleton sending-skeleton">
      <div class="skeleton-icon"><VideoIcon size={32} /></div>
      <span class="skeleton-text">{message.file?.name}</span>
    </div>
  {/if}
{:else}
  <!-- Receiver video -->
  {#if localUrl}
    {#if message.file?.isReceiving}
      <div class="image-uploading-wrapper">
        <video src="{localUrl}#t=0.1" class="dimmed-image previewable-video" preload="metadata">
          <track kind="captions" />
        </video>
        <TransferProgress
          file={message.file!}
          messageId={message.id}
          senderId={message.senderId}
          variant="overlay"
        />
      </div>
    {:else}
      <button
        type="button"
        class="video-button-wrapper"
        onclick={() => localUrl && onPreview(localUrl)}
        aria-label={`Preview ${message.file?.name}`}
      >
        <video
          src="{localUrl}#t=0.1"
          class="previewable-video"
          title="{message.file?.name} - {formatFileSize(message.file?.size || 0)}"
          preload="metadata"
        >
          <track kind="captions" />
        </video>
      </button>
    {/if}
  {:else}
    <!-- Receiver: đang chờ tải hoặc đang nhận -->
    <FileAttachment {message} />
  {/if}
{/if}

<style lang="scss">
  .video-button-wrapper {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    display: block;
    border-radius: 14px;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--accent-color);
      outline-offset: 2px;
    }
  }

  video {
    max-width: 250px;
    max-height: 250px;
    border-radius: 14px;
    object-fit: cover;
    display: block;

    &.previewable-video {
      border-radius: 14px;
    }
  }

  .image-uploading-wrapper {
    position: relative;
    display: inline-block;

    video.dimmed-image {
      filter: blur(2px) brightness(0.65);
    }
  }

  .image-skeleton {
    width: 220px;
    height: 140px;
    border-radius: 14px;
    background: rgba(var(--color-gray-500-rgb), 0.1);
    border: 2px dashed rgba(var(--color-gray-500-rgb), 0.2);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px;
    color: inherit;

    .skeleton-icon {
      font-size: 2.2rem;
      opacity: 0.5;
      animation: pulse 2s infinite;
    }

    &.sending-skeleton {
      width: auto;
      height: auto;
      flex-direction: row;
      gap: 8px;
      padding: 10px 14px;
      justify-content: flex-start;

      .skeleton-icon {
        font-size: 1.4rem;
        animation: pulse 2s infinite;
      }
      .skeleton-text {
        font-size: 0.82rem;
        font-weight: 500;
        opacity: 0.7;
      }
    }
  }

  @keyframes pulse {
    from {
      transform: scale(1);
      opacity: 0.8;
    }
    to {
      transform: scale(1.1);
      opacity: 1;
    }
  }
</style>
