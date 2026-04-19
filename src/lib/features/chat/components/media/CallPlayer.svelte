<script lang="ts">
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';

  let localStream = $derived(webrtc.localCallStream);
  let remoteStream = $derived(
    webrtc.callPeerId ? webrtc.remoteMediaStreams[webrtc.callPeerId] : null
  );

  let localVideoRef = $state<HTMLVideoElement>();
  let remoteVideoRef = $state<HTMLVideoElement>();
  let remoteAudioRef = $state<HTMLAudioElement>();

  let activePeer = $derived(webrtc.peer.find((p) => p.id === webrtc.callPeerId));
  let peerName = $derived(activePeer?.name || 'Unknown');

  // Call timer
  let callStartTime = $state(Date.now());
  let callDuration = $state(0);
  let formattedDuration = $derived(
    `${Math.floor(callDuration / 60)
      .toString()
      .padStart(2, '0')}:${(callDuration % 60).toString().padStart(2, '0')}`
  );

  $effect(() => {
    const interval = setInterval(() => {
      callDuration = Math.floor((Date.now() - callStartTime) / 1000);
    }, 1000);
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (localVideoRef && localStream) {
      if (localVideoRef.srcObject !== localStream) {
        localVideoRef.srcObject = localStream;
      }
    }
  });

  $effect(() => {
    if (remoteVideoRef && remoteStream) {
      if (remoteVideoRef.srcObject !== remoteStream) {
        remoteVideoRef.srcObject = remoteStream;
      }
    }
  });

  $effect(() => {
    if (remoteAudioRef && remoteStream) {
      if (remoteAudioRef.srcObject !== remoteStream) {
        remoteAudioRef.srcObject = remoteStream;
      }
    }
  });

  function handleEndCall() {
    webrtc.endCall();
  }
</script>

<div class="call-player-container" class:voice-only={!webrtc.callWithVideo}>
  {#if webrtc.callWithVideo}
    <div class="remote-video-container">
      {#if remoteStream}
        <video bind:this={remoteVideoRef} autoplay playsinline class="remote-video"></video>
        <div class="video-call-timer">{formattedDuration}</div>
      {:else}
        <div class="connecting">{i18n.t('callConnecting')}</div>
      {/if}
    </div>

    <!-- PiP Local Video -->
    <div class="local-video-container">
      {#if localStream}
        <video bind:this={localVideoRef} autoplay playsinline muted class="local-video"></video>
      {/if}
    </div>
  {:else}
    <!-- Voice Call UI -->
    <div class="ambient-layer">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
    </div>
    <div class="glass-overlay"></div>

    <div class="voice-center">
      <div class="avatar-circle">
        {peerName.charAt(0).toUpperCase()}
      </div>
      <div class="voice-timer">{formattedDuration}</div>
    </div>
    <!-- Hidden Audio Elements -->
    <audio bind:this={remoteAudioRef} autoplay></audio>
  {/if}

  <div class="action-bar">
    <GlassButton size="md" onclick={handleEndCall} className="btn-decline">
      {i18n.t('callEnd')}
    </GlassButton>
  </div>
</div>

<style lang="scss">
  .call-player-container {
    width: 100%;
    height: 100%;
    position: relative;
    background: rgba(var(--color-black-rgb), 0.93);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(var(--color-black-rgb), 0.15);
    border: 1px solid var(--glass-border);

    &.voice-only {
      background: transparent;
    }

    .ambient-layer {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 0;

      .blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(60px);
        opacity: 0.6;
        animation: floatBlob 10s infinite alternate ease-in-out;
      }

      .blob-1 {
        width: 300px;
        height: 300px;
        background: rgba(var(--color-indigo-500-rgb), 0.8);
        top: -100px;
        left: -100px;
      }

      .blob-2 {
        width: 250px;
        height: 250px;
        background: rgba(var(--color-blue-500-rgb), 0.8);
        bottom: -50px;
        right: -50px;
        animation-delay: -5s;
        animation-duration: 12s;
      }
    }

    .glass-overlay {
      position: absolute;
      inset: 0;
      background: var(--glass-bg);
      -webkit-backdrop-filter: blur(40px);
      backdrop-filter: blur(40px);
      z-index: 1;
    }

    .voice-center {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;

      .voice-timer {
        color: var(--text-main);
        font-size: 1.25rem;
        font-variant-numeric: tabular-nums;
        background: rgba(var(--color-black-rgb), 0.4);
        padding: 4px 16px;
        border-radius: 20px;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 12px rgba(var(--color-black-rgb), 0.2);
      }
    }

    .avatar-circle {
      position: relative;
      z-index: 2;
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
  }

  .remote-video-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    .remote-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .video-call-timer {
      position: absolute;
      top: 20px;
      left: 20px;
      color: var(--color-white);
      background: rgba(var(--color-black-rgb), 0.6);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 1rem;
      font-variant-numeric: tabular-nums;
      backdrop-filter: blur(4px);
      z-index: 15;
    }

    .connecting {
      color: var(--color-white);
      opacity: 0.6;
    }
  }

  .local-video-container {
    position: absolute;
    bottom: 90px;
    right: 20px;
    width: 150px;
    height: 200px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--color-black);
    border: 2px solid rgba(var(--color-white-rgb), 0.2);
    box-shadow: 0 5px 20px rgba(var(--color-black-rgb), 0.4);
    z-index: 10;
    transition: transform 0.3s;

    &:hover {
      transform: scale(1.05);
    }

    .local-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1); /* Mirror effect */
    }
  }

  .action-bar {
    position: absolute;
    bottom: 20px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 20px;
    z-index: 20;

    :global(.btn-decline) {
      background: rgba(var(--color-red-500-rgb), 0.2) !important;
      border-color: rgba(var(--color-red-500-rgb), 0.4) !important;
      color: var(--color-red-400) !important;

      &:hover {
        background: rgba(var(--color-red-500-rgb), 0.3) !important;
      }
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

  @keyframes floatBlob {
    0% {
      transform: translate(0, 0) scale(1);
    }
    33% {
      transform: translate(30px, -50px) scale(1.1);
    }
    66% {
      transform: translate(-20px, 20px) scale(0.9);
    }
    100% {
      transform: translate(0, 0) scale(1);
    }
  }
</style>
