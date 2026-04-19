<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { log } from '$lib/core/logger';
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import AudioVisualizer from '$lib/features/chat/components/attachments/AudioVisualizer.svelte';
  import PlayIcon from '$lib/shared/components/icons/PlayIcon.svelte';
  import PauseIcon from '$lib/shared/components/icons/PauseIcon.svelte';
  import TrashIcon from '$lib/shared/components/icons/TrashIcon.svelte';

  interface Props {
    onDone: (file: File) => void;
    onCancel: () => void;
  }
  let { onDone, onCancel }: Props = $props();

  let mediaRecorder = $state<MediaRecorder | null>(null);
  let audioChunks: Blob[] = [];
  let recordingDuration = $state(0);
  let isPaused = $state(false);
  let recordingInterval: ReturnType<typeof setTimeout> | undefined;
  let isCancelled = false;

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      isCancelled = false;
      const options = MediaRecorder.isTypeSupported('audio/webm')
        ? { mimeType: 'audio/webm' }
        : undefined;
      mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstart = () => {
        recordingDuration = 0;
        recordingInterval = setInterval(() => {
          if (mediaRecorder?.state === 'recording') recordingDuration++;
        }, 1000);
      };

      mediaRecorder.onstop = () => {
        clearInterval(recordingInterval);
        stream.getTracks().forEach((t) => t.stop());
        if (!isCancelled && audioChunks.length > 0) {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
          onDone(file);
        }
      };

      mediaRecorder.start();
    } catch (e) {
      log.sys.error('Failed to start recording:', e);
      toast.error(i18n.t('micError'));
      onCancel();
    }
  }

  function togglePause() {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.pause();
      isPaused = true;
    } else if (mediaRecorder?.state === 'paused') {
      mediaRecorder.resume();
      isPaused = false;
    }
  }

  function stop() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  }

  function cancel() {
    isCancelled = true;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    onCancel();
  }

  function formatTime(s: number) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  onMount(() => {
    start();
  });
  onDestroy(() => {
    clearInterval(recordingInterval);
    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
  });

  export { stop };
</script>

<div class="recorder-ui">
  <div class="red-dot" class:blinking={!isPaused}></div>
  <span class="timer">{formatTime(recordingDuration)}</span>
  <AudioVisualizer stream={mediaRecorder?.stream || null} {isPaused} />

  <div class="actions">
    <button class="action-btn" onclick={togglePause} type="button">
      {#if isPaused}
        <PlayIcon size={18} />
      {:else}
        <PauseIcon size={18} />
      {/if}
    </button>
    <button class="action-btn cancel" onclick={cancel} type="button">
      <TrashIcon size={18} />
    </button>
  </div>
</div>

<style lang="scss">
  .recorder-ui {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding-left: 12px;

    .red-dot {
      width: 10px;
      height: 10px;
      background-color: var(--color-danger);
      border-radius: 50%;
      &.blinking {
        animation: blinker 1s linear infinite;
      }
    }

    .timer {
      font-family: monospace;
      font-size: 1.1rem;
    }

    .actions {
      margin-left: auto;
      display: flex;
      gap: 4px;
    }

    .action-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      &:hover {
        background: rgba(var(--color-slate-500-rgb), 0.1);
        color: var(--text-main);
      }
      &.cancel:hover {
        background: rgba(var(--color-danger-rgb), 0.15);
        color: var(--color-red-500);
      }
    }
  }
  @keyframes blinker {
    50% {
      opacity: 0;
    }
  }
</style>
