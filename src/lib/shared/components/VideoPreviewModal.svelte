<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import DownloadIcon from '$lib/shared/components/icons/DownloadIcon.svelte';

  interface Props {
    url: string;
    name: string;
    onClose: () => void;
  }

  let { url, name, onClose }: Props = $props();
</script>

<div
  class="video-modal-backdrop"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <button class="modal-close" aria-label={i18n.t('close')} onclick={onClose}>
    <CloseIcon size="28" strokeWidth="2.5" />
  </button>
  <video src={url} controls class="modal-video" autoplay>
    <track kind="captions" />
  </video>
  <div class="modal-actions">
    <GlassButton variant="pill" href={url} download={name}>
      <DownloadIcon />
      {i18n.t('downloadBtn')}
    </GlassButton>
  </div>
</div>

<style lang="scss">
  .video-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(var(--color-black-rgb), 0.85);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;

    .modal-close {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(var(--color-white-rgb), 0.1);
      border: none;
      color: var(--color-white);
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      z-index: 2;

      &:hover {
        background: rgba(var(--color-white-rgb), 0.25);
        transform: rotate(90deg);
      }
    }

    .modal-video {
      max-width: 90vw;
      max-height: 80vh;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(var(--color-black-rgb), 0.5);
      animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .modal-actions {
      margin-top: 1.5rem;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes scaleUp {
    from {
      transform: scale(0.9);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
