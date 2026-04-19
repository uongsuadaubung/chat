<script lang="ts">
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';
  import PhoneIcon from '$lib/shared/components/icons/PhoneIcon.svelte';
  import VideoIcon from '$lib/shared/components/icons/VideoIcon.svelte';

  // Derived states
  let activePeer = $derived(webrtc.peer.find((p) => p.id === webrtc.callPeerId));
  let peerName = $derived(activePeer?.name || 'Unknown');

  function handleAccept() {
    webrtc.acceptCall();
  }

  function handleDecline() {
    webrtc.declineCall();
  }

  function handleEndCall() {
    webrtc.endCall();
  }
</script>

{#if webrtc.callState === 'ringing'}
  <div class="call-modal-backdrop">
    <div class="call-modal">
      <div class="call-header">
        <div class="peer-info">
          <h3>
            {webrtc.callIsIncoming ? i18n.t('callIncomingFrom') : i18n.t('callingTo')}
          </h3>
        </div>
      </div>

      <div class="media-container voice-only">
        <div class="avatar-circle">
          {peerName.charAt(0).toUpperCase()}
        </div>
        <div class="calling-status">
          <h2>{peerName}</h2>
          <div class="call-type-badge">
            {#if webrtc.callWithVideo}
              <VideoIcon size={16} /> <span>{i18n.t('videoCall')}</span>
            {:else}
              <PhoneIcon size={16} /> <span>{i18n.t('voiceCall')}</span>
            {/if}
          </div>
          <span class="status">{i18n.t('callRinging')}</span>
        </div>
      </div>

      <div class="action-bar">
        {#if webrtc.callIsIncoming}
          <GlassButton size="md" onclick={handleDecline} className="btn-decline">
            {i18n.t('callDecline')}
          </GlassButton>
          <GlassButton size="md" onclick={handleAccept} className="btn-accept">
            {i18n.t('callAccept')}
          </GlassButton>
        {:else}
          <GlassButton size="md" onclick={handleEndCall} className="btn-decline">
            {i18n.t('callCancel')}
          </GlassButton>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .call-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(var(--color-black-rgb), 0.8);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000; /* Highest priority */
    animation: fadeIn 0.3s ease;
  }

  .call-modal {
    width: 90vw;
    max-width: 400px;
    height: auto;
    min-height: 400px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    box-shadow: 0 10px 40px rgba(var(--color-black-rgb), 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    padding-bottom: 80px;
    animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .call-header {
    padding: 20px;
    text-align: center;
    z-index: 10;

    .peer-info {
      color: var(--text-main);

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 500;
        opacity: 0.8;
      }
    }
  }

  .media-container {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;

    .avatar-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(var(--color-blue-500-rgb), 0.5);
      border: 2px solid rgba(var(--color-blue-500-rgb), 0.8);
      color: var(--color-white);
      font-size: 3rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 30px rgba(var(--color-blue-500-rgb), 0.3);
      animation: pulse 2s infinite ease-in-out;
    }

    .calling-status {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--text-main);

      h2 {
        margin: 0;
        font-size: 1.8rem;
      }

      .call-type-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(var(--color-blue-500-rgb), 0.15);
        border: 1px solid rgba(var(--color-blue-500-rgb), 0.3);
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--color-blue-400);
      }

      .status {
        opacity: 0.8;
        font-size: 1rem;
        animation: pulseText 1.5s infinite;
      }
    }
  }

  .action-bar {
    position: absolute;
    bottom: 30px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 20px;
    z-index: 20;

    :global(.btn-accept) {
      background: rgba(var(--color-emerald-500-rgb), 0.2) !important;
      border-color: rgba(var(--color-emerald-500-rgb), 0.4) !important;
      color: var(--color-emerald-500) !important;

      &:hover {
        background: rgba(var(--color-emerald-500-rgb), 0.3) !important;
      }
    }

    :global(.btn-decline) {
      background: rgba(var(--color-red-500-rgb), 0.2) !important;
      border-color: rgba(var(--color-red-500-rgb), 0.4) !important;
      color: var(--color-red-400) !important;

      &:hover {
        background: rgba(var(--color-red-500-rgb), 0.3) !important;
      }
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

  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(var(--color-blue-500-rgb), 0.7);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 20px rgba(var(--color-blue-500-rgb), 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(var(--color-blue-500-rgb), 0);
    }
  }
  @keyframes pulseText {
    0%,
    100% {
      opacity: 0.8;
    }
    50% {
      opacity: 0.4;
    }
  }
</style>
