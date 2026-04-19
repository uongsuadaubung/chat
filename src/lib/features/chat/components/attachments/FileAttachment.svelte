<script lang="ts">
  import type { ChatMessage } from '$lib/type';
  import { formatFileSize } from '$lib/core/util';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { blobCache } from '$lib/core/blobCache';
  import { onDestroy } from 'svelte';
  import FileIcon from '$lib/shared/components/icons/FileIcon.svelte';
  import DownloadIcon from '$lib/shared/components/icons/DownloadIcon.svelte';
  import CheckCircleIcon from '$lib/shared/components/icons/CheckCircleIcon.svelte';
  import UploadIcon from '$lib/shared/components/icons/UploadIcon.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';
  import TransferProgress from '$lib/features/chat/components/attachments/TransferProgress.svelte';
  import AlertTriangleIcon from '$lib/shared/components/icons/AlertTriangleIcon.svelte';

  interface Props {
    message: ChatMessage;
  }
  let { message }: Props = $props();

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

  async function handleDownloadClick(fileId: string, senderId: string) {
    webrtc.requestDownload(fileId, senderId);
  }

  let isSendingOrReceivingStatus = $derived(
    message.isSelf && !message.file?.isReceiving && !message.file?.isPendingDownload
  );

  let isTransferring = $derived(message.file?.isReceiving || message.file?.isSending);
</script>

<div class="file-attachment">
  <div class="file-info">
    <div class="file-icon"><FileIcon size={20} /></div>
    <div class="file-details">
      <span class="file-name">{message.file?.name}</span>
      <span class="file-size">{formatFileSize(message.file?.size || 0)}</span>
    </div>
  </div>
  {#if isSendingOrReceivingStatus}
    <!-- Sender: hiện trạng thái tiến độ gửi tiến tế (tooltip khi hover) -->
    <div class="sender-file-status">
      {#if isTransferring}
        <span
          class="status-dot sending"
          title="{i18n.t('statusSending')} — {message.file?.progress || 0}%"
        >
          <UploadIcon size={12} />
          {message.file?.progress || 0}%
        </span>
      {:else if (message.file?.progress ?? 0) >= 100}
        <span class="status-dot done" title={i18n.t('statusDone')}
          ><CheckCircleIcon size={14} /></span
        >
      {:else}
        <span class="status-dot waiting" title={i18n.t('statusWaiting')}>···</span>
      {/if}
    </div>
  {:else}
    <!-- Receiver: hiện đầy đủ trạng thái + nút -->
    {#if message.file?.isPendingDownload}
      <GlassButton
        size="sm"
        fullWidth
        ariaLabel="{i18n.t('downloadBtn')} {message.file?.name}"
        onclick={() => handleDownloadClick(message.id, message.senderId)}
      >
        <DownloadIcon size={16} />
        {i18n.t('downloadBtn')} ({formatFileSize(message.file?.size || 0)})
      </GlassButton>
    {:else if message.file?.isReceiving}
      <TransferProgress
        file={message.file!}
        messageId={message.id}
        senderId={message.senderId}
        variant="block"
      />
    {:else if message.file?.isExpired}
      <span class="file-status expired">
        <AlertTriangleIcon size={16} class="status-icon" />
        {i18n.t('fileExpired')}
      </span>
    {:else if localUrl}
      <GlassButton size="sm" fullWidth href={localUrl} download={message.file?.name}>
        <DownloadIcon size={16} />
        {i18n.t('downloadBtn')}
      </GlassButton>
    {:else if message.file?.progress === 100}
      <span class="file-status saved">
        <CheckCircleIcon size={16} class="status-icon" />
        {i18n.t('fileSaved')}
      </span>
    {/if}
    {#if message.file?.error}
      <span class="file-status error">{message.file?.error}</span>
    {/if}
  {/if}
</div>

<style lang="scss">
  .file-attachment {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
    width: 220px;

    .file-info {
      display: flex;
      align-items: center;
      gap: 12px;

      .file-icon {
        width: 36px;
        height: 36px;
        background: rgba(var(--color-gray-500-rgb), 0.15);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        flex-shrink: 0;
      }

      .file-details {
        display: flex;
        flex-direction: column;
        min-width: 0;

        .file-name {
          font-weight: 600;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .file-size {
          font-size: 0.75rem;
          color: var(--text-muted);
          opacity: 0.8;
        }
      }
    }

    .file-status {
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;

      &.expired {
        color: var(--text-muted);
      }
      &.saved {
        color: var(--accent-color);
      }
      &.error {
        color: var(--error-color);
      }
    }

    /* Sender-side file status badge */
    .sender-file-status {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
    }

    .status-dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 99px;
      cursor: default;
      opacity: 0.75;
      transition: opacity 0.2s;

      &:hover {
        opacity: 1;
      }

      &.waiting {
        background: rgba(var(--color-gray-500-rgb), 0.15);
        color: var(--text-muted);
        letter-spacing: 2px;
      }
      &.sending {
        background: rgba(var(--accent-color-rgb), 0.15);
        color: var(--accent-color);
      }
      &.done {
        background: rgba(var(--color-emerald-500-rgb), 0.12);
        color: var(--status-online-color);
      }
    }
  }
</style>
