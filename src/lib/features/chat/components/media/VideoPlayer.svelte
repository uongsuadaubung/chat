<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';

  interface Props {
    stream: MediaStream;
    muted?: boolean;
    isLocal?: boolean;
  }
  let { stream, muted = false, isLocal = false }: Props = $props();

  let videoElement: HTMLVideoElement | null = $state(null);
  let autoplayFailed = $state(false);

  $effect(() => {
    if (videoElement && stream) {
      if (videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
        videoElement.play().catch((err: Error) => {
          if (err.name === 'NotAllowedError') {
            console.debug('Auto-play prevent:', err);
            autoplayFailed = true;
          } else {
            toast.error(i18n.t('p2pFailed') + ': ' + err.message);
          }
        });
      }
    }
  });

  function handleManualPlay() {
    if (videoElement) {
      videoElement
        .play()
        .then(() => {
          autoplayFailed = false;
        })
        .catch((err: Error) => {
          toast.error(i18n.t('p2pFailed') + ': ' + err.message);
        });
    }
  }
</script>

<div class="video-container" class:is-local={isLocal}>
  <div class="video-wrapper">
    <video bind:this={videoElement} {muted} autoplay playsinline disablepictureinpicture></video>
    {#if autoplayFailed}
      <div class="autoplay-overlay">
        <div class="autoplay-content">
          <p>{i18n.t('clickToPlayVideo')}</p>
          <GlassButton variant="pill" onclick={handleManualPlay}>
            {i18n.t('playBtn')}
          </GlassButton>
        </div>
      </div>
    {/if}
  </div>

  {#if isLocal}
    <div class="controls-overlay">
      <GlassButton variant="pill" size="sm" className="badge-btn" disabled>
        {i18n.t('youAreSharing')}
      </GlassButton>
      <GlassButton
        variant="pill"
        size="sm"
        className="stop-btn"
        onclick={() => webrtc.stopScreenShare()}
      >
        {i18n.t('stopScreenShare')}
      </GlassButton>
    </div>
  {/if}
</div>

<style lang="scss">
  .video-container {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--color-black);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(var(--color-black-rgb), 0.15);

    .video-wrapper {
      flex: 1;
      width: 100%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;

      video {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .autoplay-overlay {
        position: absolute;
        inset: 0;
        background: rgba(var(--color-black-rgb), 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        animation: fadeIn 0.3s ease;

        .autoplay-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
          padding: 24px;
          max-width: 80%;

          p {
            color: var(--color-white);
            font-size: 1.1rem;
            margin: 0;
            font-weight: 500;
            line-height: 1.5;
          }
        }
      }
    }

    .controls-overlay {
      position: static;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px;
      background: var(--glass-bg);
      border-top: 1px solid var(--glass-border);

      :global(.badge-btn) {
        pointer-events: none;
        opacity: 1 !important; /* disabled button dim fix */
      }

      :global(.stop-btn) {
        color: var(--color-red-500);
      }

      :global(.stop-btn:hover:not(:disabled)) {
        color: var(--color-white);
        background: var(--color-red-500);
      }
    }
  }
</style>
