<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import ChatSidebar from '$lib/features/chat/components/ChatSidebar.svelte';
  import ChatMessages from '$lib/features/chat/components/ChatMessages.svelte';
  import ChatInput from '$lib/features/chat/components/ChatInput.svelte';
  import TypingIndicator from '$lib/features/chat/components/TypingIndicator.svelte';
  import MenuIcon from '$lib/shared/components/icons/MenuIcon.svelte';
  import FileDropIcon from '$lib/shared/components/icons/FileDropIcon.svelte';
  import NetworkQualityHUD from '$lib/features/chat/components/NetworkQualityHUD.svelte';
  import ChatBubbleIcon from '$lib/shared/components/icons/ChatBubbleIcon.svelte';
  import VideoIcon from '$lib/shared/components/icons/VideoIcon.svelte';
  import PhoneIcon from '$lib/shared/components/icons/PhoneIcon.svelte';
  import InfoIcon from '$lib/shared/components/icons/InfoIcon.svelte';
  import LockIcon from '$lib/shared/components/icons/LockIcon.svelte';
  import VideoPlayer from '$lib/features/chat/components/media/VideoPlayer.svelte';
  import CallPlayer from '$lib/features/chat/components/media/CallPlayer.svelte';
  import RoomInfoSidebar from '$lib/features/chat/components/RoomInfoSidebar.svelte';
  import PinnedMessageBanner from '$lib/features/chat/components/PinnedMessageBanner.svelte';

  import { authStore } from '$lib/shared/stores/auth.store.svelte';
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { contactsStore } from '$lib/features/chat/stores/contact.store.svelte';
  import { fade } from 'svelte/transition';

  let activeStream = $derived(
    webrtc.callState !== 'idle'
      ? null
      : webrtc.localMediaStream ||
          (chatStore.selectedPeerId ? webrtc.remoteMediaStreams[chatStore.selectedPeerId] : null)
  );
  // isScreenSharing: có local screen share stream và không đang trong call
  let isScreenSharing = $derived(!!webrtc.localMediaStream && webrtc.callState === 'idle');
  let isScreenSharingStatus = $derived(isScreenSharing);
  let isRemoteStream = $derived(
    chatStore.selectedPeerId ? !!webrtc.remoteMediaStreams[chatStore.selectedPeerId] : false
  );

  let isVideoSectionOpen = $derived(!!activeStream || webrtc.callState === 'in_call');

  /**
   * Peer đang online hiện tại (null nếu offline).
   * Được dùng để hiển thị nút gọi điện và tên trong header.
   */
  let selectedOnlinePeer = $derived(
    chatStore.selectedPeerId
      ? webrtc.peer.find((p) => p.id === chatStore.selectedPeerId)
      : undefined
  );

  /**
   * Tên hiển thị: uu tiên peer online, rồi đến danh bạ, cuối cùng là 'Chat'.
   */
  let selectedPeerName = $derived(
    selectedOnlinePeer?.name ??
      (chatStore.selectedPeerId
        ? contactsStore.contacts.find((c) => c.peerId === chatStore.selectedPeerId)?.name
        : undefined) ??
      i18n.t('chat')
  );

  let canShowCallButtons = $derived(
    !!selectedOnlinePeer &&
      selectedOnlinePeer.connected &&
      !activeStream &&
      webrtc.callState === 'idle'
  );

  async function handleScreenShareToggle() {
    if (webrtc.localMediaStream) {
      webrtc.stopScreenShare();
    } else {
      // Always request audio; the browser native picker let users uncheck it if they want
      await webrtc.startScreenShare(true);
    }
  }

  onMount(() => {
    // Join global room automatically
    if (authStore.user) {
      webrtc.joinRoom('global', authStore.user);
    }
  });

  onDestroy(() => {
    if (webrtc.localMediaStream) {
      webrtc.stopScreenShare();
    }
    webrtc.leaveRoom();
  });

  $effect(() => {
    // Tự động chọn người đang online đầu tiên nếu chưa chọn ai
    if (!chatStore.selectedPeerId && webrtc.peer && webrtc.peer.length > 0) {
      const targetPeer = webrtc.peer.find((p) => p.connected);
      if (targetPeer) {
        chatStore.selectedPeerId = targetPeer.id;
      }
    }
  });

  // Tự động ẩn sidebar khi bắt đầu share màn hình hoặc đang trong cuộc gọi
  $effect(() => {
    if (isVideoSectionOpen) {
      untrack(() => {
        chatStore.showSidebar = false;
      });
    }
  });

  function handleSendFile(file: File) {
    if (chatStore.selectedPeerId) {
      webrtc.sendFile(file, chatStore.selectedPeerId);
    }
  }

  let isDragging = $state(false);

  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    if (
      e.currentTarget &&
      e.relatedTarget &&
      (e.currentTarget as Node).contains(e.relatedTarget as Node)
    ) {
      return;
    }
    isDragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;

    if (e.dataTransfer?.files.length) {
      Array.from(e.dataTransfer.files).forEach((file) => {
        handleSendFile(file);
      });
    }
  }
</script>

<svelte:window
  onbeforeunload={() => {
    if (webrtc.callState !== 'idle') {
      webrtc.endCall();
    } else if (webrtc.localMediaStream) {
      webrtc.stopScreenShare();
    }
    webrtc.leaveRoom();
  }}
/>

<div
  class="chat-layout"
  class:sidebar-open={chatStore.showSidebar}
  class:has-video={isVideoSectionOpen}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="region"
  aria-label={i18n.t('workspace')}
>
  {#if isDragging}
    <div class="drag-overlay">
      <div class="drag-content">
        <FileDropIcon />
        <p>{i18n.t('dropFileToShare')}</p>
      </div>
    </div>
  {/if}
  {#if chatStore.showSidebar}
    <button
      class="sidebar-overlay"
      aria-label={i18n.t('closeSidebar')}
      onclick={() => (chatStore.showSidebar = false)}
      transition:fade={{ duration: 200 }}
    ></button>
  {/if}

  <div class="sidebar-wrapper" class:open={chatStore.showSidebar}>
    <ChatSidebar />
  </div>

  <div class="main-content" class:has-video={isVideoSectionOpen}>
    {#if webrtc.callState === 'in_call'}
      <div class="video-section call-mode">
        <CallPlayer />
      </div>
    {:else if activeStream}
      <div class="video-section screen-share-mode">
        <VideoPlayer stream={activeStream} isLocal={isScreenSharing} muted={isScreenSharing} />
      </div>
    {/if}

    <main class="chat-main" class:split={isVideoSectionOpen}>
      {#if chatStore.selectedPeerId}
        <div class="chat-header">
          <button
            class="menu-btn mobile-only"
            aria-label={i18n.t('toggleMenu')}
            onclick={() => (chatStore.showSidebar = true)}
          >
            <MenuIcon />
          </button>
          <span class="room-title">{selectedPeerName}</span>
          {#if chatStore.selectedPeerId}
            <NetworkQualityHUD peerId={chatStore.selectedPeerId} />
          {/if}
          {#if canShowCallButtons}
            <div class="header-actions">
              <button
                class="toolbar-btn"
                aria-label="Voice Call"
                title={i18n.t('voiceCall')}
                onclick={() => webrtc.startCall(selectedOnlinePeer!.id, false)}
                disabled={webrtc.callState !== 'idle'}
              >
                <PhoneIcon />
              </button>
              <button
                class="toolbar-btn"
                aria-label="Video Call"
                title={i18n.t('videoCall')}
                onclick={() => webrtc.startCall(selectedOnlinePeer!.id, true)}
                disabled={webrtc.callState !== 'idle'}
              >
                <VideoIcon />
              </button>
              <button
                class="toolbar-btn"
                aria-label={i18n.t('roomInfo')}
                title={i18n.t('roomInfo')}
                onclick={() => (chatStore.showRightSidebar = !chatStore.showRightSidebar)}
              >
                <InfoIcon />
              </button>
            </div>
          {:else if chatStore.selectedPeerId}
            <!-- Offline contact — chỉ hiện nút info -->
            <div class="header-actions">
              <button
                class="toolbar-btn"
                aria-label={i18n.t('roomInfo')}
                title={i18n.t('roomInfo')}
                onclick={() => (chatStore.showRightSidebar = !chatStore.showRightSidebar)}
              >
                <InfoIcon />
              </button>
            </div>
          {/if}
        </div>
        <PinnedMessageBanner />
        <ChatMessages />
        <TypingIndicator />
        <ChatInput
          onScreenShareToggle={handleScreenShareToggle}
          isScreenShareDisabled={isRemoteStream && !isScreenSharing}
          isScreenSharing={isScreenSharingStatus}
        />
      {:else}
        <div class="chat-header">
          <button
            class="menu-btn mobile-only"
            aria-label={i18n.t('toggleMenu')}
            onclick={() => (chatStore.showSidebar = true)}
          >
            <MenuIcon />
          </button>
          <span class="room-title">P2P Messenger</span>
        </div>
        <div class="empty-state">
          <div class="icon-wrapper"><ChatBubbleIcon size="64" /></div>
          <h2>{i18n.t('selectChat')}</h2>
          <p>{i18n.t('selectChatDesc')}</p>
          <div class="room-notice">
            <LockIcon size="14" />
            {i18n.t('encryptionNotice')}
          </div>
        </div>
      {/if}
    </main>
  </div>

  <RoomInfoSidebar />
  {#if chatStore.showRightSidebar}
    <button
      class="sidebar-overlay right-sidebar-overlay"
      aria-label={i18n.t('close')}
      onclick={() => (chatStore.showRightSidebar = false)}
      transition:fade={{ duration: 200 }}
    ></button>
  {/if}
</div>

<style lang="scss">
  .chat-layout {
    display: flex;
    height: 100vh;
    height: 100dvh;
    width: 100%;
    background: transparent;
    overflow: hidden;
    position: relative;
  }

  .drag-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    bottom: 8px;
    background: rgba(var(--color-indigo-500-rgb), 0.05);
    backdrop-filter: blur(4px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--text-muted);
    border-radius: 12px;
    pointer-events: none; /* Let drag events pass through to container */

    .drag-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      color: var(--text-main);
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      padding: 2.5rem 3rem;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(var(--color-black-rgb), 0.15);

      p {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
      }
    }
  }

  /* Mobile-first sidebar wrapper */
  .sidebar-wrapper {
    position: absolute;
    top: 0;
    left: -320px;
    height: 100%;
    z-index: 50;
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;

    &.open {
      left: 0;
    }
  }

  .sidebar-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    background: var(--backdrop-bg);
    z-index: 40; /* Behind left sidebar (50) */
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border: none;
    margin: 0;
    padding: 0;
    cursor: default;

    @media (max-width: 768px) {
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      background: rgba(var(--color-black-rgb), 0.5);
    }

    &.right-sidebar-overlay {
      z-index: 900; /* Behind right sidebar (1000) */

      @media (min-width: 769px) {
        display: none !important;
      }

      @media (max-width: 768px) {
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        background: rgba(var(--color-black-rgb), 0.7);
      }
    }
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    width: 100%;

    @media (min-width: 1024px) {
      flex-direction: row;
    }
  }

  .video-section {
    flex: 1;
    background: var(--glass-bg);
    padding: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
  }

  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: transparent;
    overflow: hidden;
    width: 100%;

    &.split {
      @media (min-width: 1024px) {
        flex: 0 0 350px;
        border-left: 1px solid var(--glass-border);
      }
    }
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8rem 1rem;
    background: var(--glass-bg);
    border-bottom: 1px solid var(--glass-border);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);

    .menu-btn {
      background: none;
      border: none;
      color: var(--text-main);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.4rem;
      border-radius: 8px;
      transition: background 0.2s;

      &:hover {
        background: rgba(var(--color-gray-500-rgb), 0.1);
      }
    }

    .room-title {
      font-weight: 700;
      color: var(--text-main);
      font-size: 1.1rem;
      flex: 1;
      margin-left: 0.5rem;
    }

    .header-actions {
      display: flex;
      gap: 0.5rem;
    }

    .toolbar-btn {
      background: none;
      border: none;
      color: var(--text-main);
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;

      &:hover {
        background: rgba(var(--color-gray-500-rgb), 0.1);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
  }

  @media (min-width: 768px) {
    .chat-layout:not(.has-video) .sidebar-wrapper {
      position: relative;
      left: 0;
      transition: none;
    }

    .chat-layout:not(.has-video) .sidebar-overlay {
      display: none;
    }

    .chat-layout:not(.has-video) .mobile-only {
      display: none !important;
    }
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: var(--glass-bg);
    color: var(--text-main);

    .icon-wrapper {
      margin-bottom: 1.5rem;
      opacity: 0.8;
      color: var(--text-muted);
    }

    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 0.5rem;
    }

    p {
      color: var(--text-muted);
      font-size: 1rem;
      margin: 0;
    }

    .room-notice {
      display: flex;
      align-items: center;
      gap: 6px;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 2rem;
      padding: 0.6rem 1.2rem;
      background: rgba(var(--color-indigo-500-rgb), 0.05);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      font-weight: 500;
      animation: fadeIn 0.5s ease-out 0.3s both;

      :global(svg) {
        color: var(--color-indigo-500);
      }
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
