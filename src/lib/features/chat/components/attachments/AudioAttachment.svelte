<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ChatMessage } from '$lib/type';
  import { requestDownload } from '$lib/features/webrtc/dataChannel';
  import { blobCache } from '$lib/core/blobCache';
  import DownloadIcon from '$lib/shared/components/icons/DownloadIcon.svelte';
  import MicIcon from '$lib/shared/components/icons/MicIcon.svelte';
  import PlayIcon from '$lib/shared/components/icons/PlayIcon.svelte';
  import PauseIcon from '$lib/shared/components/icons/PauseIcon.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import TransferProgress from '$lib/features/chat/components/attachments/TransferProgress.svelte';

  let { message }: { message: ChatMessage } = $props();

  let audioEl = $state<HTMLAudioElement>();
  let paused = $state(true);
  let duration = $state(0);
  let currentTime = $state(0);
  let displayTime = $state(0);
  let animationFrameId: number;

  let restoredUrl = $state<string | null>(null);
  let currentUrl = $derived(message.file?.url || restoredUrl);
  let hasAcquired = false;

  onMount(async () => {
    if (!message.file?.url && !message.file?.isPendingDownload && !message.file?.isReceiving) {
      hasAcquired = true;
      const url = await blobCache.acquire(message.id);
      if (url) restoredUrl = url;
    }
  });

  onDestroy(() => {
    if (hasAcquired) {
      blobCache.release(message.id);
    }
  });

  $effect(() => {
    if (!paused) {
      const loop = () => {
        if (audioEl) displayTime = audioEl.currentTime;
        animationFrameId = requestAnimationFrame(loop);
      };
      animationFrameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(animationFrameId);
    } else {
      if (audioEl) displayTime = audioEl.currentTime;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    }
  });

  const handleDownload = () => {
    if (message.type === 'file' && message.file && message.file.isPendingDownload) {
      if (message.senderId) {
        requestDownload(message.id, message.senderId);
      }
    }
  };

  const togglePlay = () => {
    if (audioEl) {
      if (paused) audioEl.play();
      else audioEl.pause();
    }
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const onSeek = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const time = Number(target.value);
    displayTime = time;
    if (audioEl) audioEl.currentTime = time;
  };
</script>

<div class="audio-container" class:is-self={message.isSelf}>
  {#if currentUrl}
    <audio
      bind:this={audioEl}
      src={currentUrl}
      bind:currentTime
      bind:duration
      bind:paused
      onended={() => (paused = true)}
      style="display: none;"
    ></audio>
    <div class="custom-player">
      <button class="play-btn" onclick={togglePlay}>
        {#if paused}
          <PlayIcon size={18} />
        {:else}
          <PauseIcon size={18} />
        {/if}
      </button>

      <div class="progress-wrapper">
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.001"
          value={displayTime}
          oninput={onSeek}
        />
        <div class="time-display">
          {formatTime(displayTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  {:else if message.file?.isPendingDownload}
    <button class="download-placeholder" onclick={handleDownload}>
      <MicIcon size={20} />
      <span>{i18n.t('voiceMessage')}</span>
      <div class="dl-btn">
        <DownloadIcon size={16} />
      </div>
    </button>
  {:else if message.file?.isReceiving || message.file?.isSending}
    <TransferProgress
      file={message.file}
      messageId={message.id}
      senderId={message.senderId}
      variant="minimal"
    />
  {:else}
    <div class="progress-box">
      <MicIcon size={20} class="error-icon" />
      <span>{i18n.t('errorOrExpired')}</span>
    </div>
  {/if}
</div>

<style lang="scss">
  .audio-container {
    display: flex;
    align-items: center;
    background: rgba(var(--color-black-rgb), 0.05);
    border-radius: 20px;
    padding: 4px;
    min-width: 150px;

    &.is-self {
      .play-btn {
        background: rgb(var(--color-white-rgb));
        color: var(--accent-color);
      }
      .progress-wrapper input[type='range'] {
        background: rgba(var(--color-white-rgb), 0.3);
        &::-webkit-slider-thumb {
          background: rgb(var(--color-white-rgb));
        }
      }
      .progress-wrapper .time-display {
        color: rgba(var(--color-white-rgb), 0.9);
      }
    }

    .custom-player {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 12px;
      width: 250px;

      .play-btn {
        background: var(--accent-color);
        color: rgb(var(--color-white-rgb));
        border: none;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition:
          transform 0.2s,
          background 0.2s;

        &:hover {
          transform: scale(1.05);
        }
      }

      .progress-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;

        input[type='range'] {
          width: 100%;
          height: 4px;
          border-radius: 2px;
          background: rgba(var(--color-black-rgb), 0.15);
          -webkit-appearance: none;
          appearance: none;
          outline: none;

          &::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--accent-color);
            cursor: pointer;
            transition: transform 0.1s;
          }

          &::-webkit-slider-thumb:hover {
            transform: scale(1.2);
          }
        }

        .time-display {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }
      }
    }

    .download-placeholder,
    .progress-box {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      width: 100%;
      background: transparent;
      border: none;
      color: inherit;
    }

    .download-placeholder {
      cursor: pointer;
      &:hover .dl-btn {
        background: rgba(var(--color-black-rgb), 0.1);
      }

      .dl-btn {
        margin-left: auto;
        padding: 4px;
        border-radius: 50%;
        display: flex;
      }
    }

    .progress-box {
      :global(.error-icon) {
        color: var(--color-danger);
      }
    }
  }
</style>
