<script lang="ts">
  import { formatFileSize, formatTime } from '$lib/core/util';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import DownloadIcon from '$lib/shared/components/icons/DownloadIcon.svelte';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import LoaderIcon from '$lib/shared/components/icons/LoaderIcon.svelte';
  import MicIcon from '$lib/shared/components/icons/MicIcon.svelte';
  import type { FileAttach } from '$lib/features/chat/types/chat.type';

  interface Props {
    file: FileAttach;
    messageId: string;
    senderId: string;
    variant?: 'block' | 'overlay' | 'minimal';
  }
  let { file, messageId, senderId, variant = 'block' }: Props = $props();

  function handleCancel(e: Event) {
    e.stopPropagation();
    webrtc.cancelDownload(messageId, senderId);
  }
</script>

{#if variant === 'overlay'}
  <div class="image-overlay-progress">
    <span class="icon"><LoaderIcon size={20} /></span>
    <span>
      {(file.progress || 0) + '%'}
      {#if file.transferRate && (file.progress || 0) < 100}
        <br /><span class="download-meta">
          {formatFileSize(file.transferRate)}/s — {formatTime(
            (file.size * (1 - (file.progress || 0) / 100)) / file.transferRate
          )} left
        </span>
      {/if}
    </span>
    <button
      type="button"
      class="cancel-btn overlay-cancel"
      onclick={handleCancel}
      title={i18n.t('cancel')}
      aria-label={i18n.t('cancel')}
    >
      <CloseIcon size={18} />
    </button>
  </div>
{:else if variant === 'minimal'}
  <div class="progress-box">
    <MicIcon size={20} />
    <div class="track">
      <div class="fill" style="width: {file.progress || 0}%"></div>
    </div>
    {#if file.isReceiving}
      <button
        class="cancel-btn minimal-cancel"
        onclick={handleCancel}
        title={i18n.t('cancel')}
        aria-label={i18n.t('cancel')}
      >
        <CloseIcon size={14} />
      </button>
    {/if}
  </div>
{:else}
  <!-- block variant -->
  <div class="transfer-status">
    <div class="transfer-row">
      <span class="transfer-label">
        <DownloadIcon size={14} class="button-icon" />
        {i18n.t('downloading')}
      </span>
      <div class="transfer-actions">
        <span class="transfer-pct">{file.progress || 0}%</span>
        <button
          class="cancel-btn inline-cancel"
          onclick={handleCancel}
          title={i18n.t('cancel')}
          aria-label={i18n.t('cancel')}
        >
          <CloseIcon size={14} />
        </button>
      </div>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar" style="--progress: {file.progress || 0}%"></div>
    </div>
    {#if file.transferRate && (file.progress || 0) < 100}
      <div class="transfer-meta">
        <span>{formatFileSize(file.transferRate)}/s</span>
        <span>
          {formatTime((file.size * (1 - (file.progress || 0) / 100)) / file.transferRate)} left
        </span>
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  /* --- BLOCK VARIANT --- */
  .transfer-status {
    display: flex;
    flex-direction: column;
    gap: 5px;

    .transfer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .transfer-label {
        font-size: 0.78rem;
        font-weight: 600;
        opacity: 0.85;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .transfer-actions {
        display: flex;
        align-items: center;
        gap: 8px;

        .transfer-pct {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--accent-color);
        }

        .inline-cancel {
          background: none;
          border: none;
          padding: 2px;
          margin: 0;
          color: var(--text-muted);
          cursor: pointer;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
          transition: all 0.2s;

          &:hover {
            opacity: 1;
            color: var(--error-color);
            background: rgba(var(--error-color-rgb), 0.1);
          }
        }
      }
    }

    .progress-bar-container {
      width: 100%;
      height: 5px;
      background: rgba(var(--color-gray-500-rgb), 0.2);
      border-radius: 3px;
      overflow: hidden;

      .progress-bar {
        height: 100%;
        width: var(--progress);
        background: var(--accent-color);
        transition: width 0.25s ease;
      }
    }

    .transfer-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      opacity: 0.65;
      margin-top: 2px;
    }
  }

  /* --- OVERLAY VARIANT --- */
  .image-overlay-progress {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--color-white);
    font-weight: 600;
    text-shadow: 0 1px 4px rgba(var(--color-black-rgb), 0.8);
    gap: 4px;
    font-size: 1.1rem;

    .icon {
      font-size: 1.5rem;
      animation: pulse 1s infinite alternate;
    }

    .download-meta {
      font-size: 0.8em;
      opacity: 0.9;
    }

    .overlay-cancel {
      margin-top: 8px;
      background: rgba(var(--color-black-rgb), 0.5);
      color: var(--color-white);
      border: none;
      border-radius: 50%;
      padding: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;

      &:hover {
        background: rgba(var(--error-color-rgb), 0.8);
        transform: scale(1.1);
      }
    }
  }

  /* --- MINIMAL VARIANT (Audio) --- */
  .progress-box {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    width: 100%;
    background: transparent;
    border: none;
    color: inherit;

    .track {
      flex: 1;
      height: 6px;
      background: rgba(var(--color-black-rgb), 0.1);
      border-radius: 3px;
      overflow: hidden;

      .fill {
        height: 100%;
        background: currentColor;
        transition: width 0.2s linear;
      }
    }

    .minimal-cancel {
      background: none;
      border: none;
      padding: 4px;
      margin: 0;
      color: currentColor;
      cursor: pointer;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
      transition: all 0.2s;

      &:hover {
        opacity: 1;
        color: var(--error-color);
        background: rgba(var(--error-color-rgb), 0.1);
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
