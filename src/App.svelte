<script lang="ts">
  import { onMount } from 'svelte';
  import { acquireTabLock } from '$lib/core/tabLock';
  import NameModal from '$lib/features/lobby/components/NameModal.svelte';
  import MessengerLayout from '$lib/features/chat/MessengerLayout.svelte';
  import TabBlocked from '$lib/shared/components/TabBlocked.svelte';
  import ToastContainer from '$lib/shared/components/ToastContainer.svelte';
  import SettingsModal from '$lib/shared/components/SettingsModal.svelte';
  import ImagePreviewModal from '$lib/shared/components/ImagePreviewModal.svelte';
  import VideoPreviewModal from '$lib/shared/components/VideoPreviewModal.svelte';
  import VideoCallModal from '$lib/features/chat/components/media/VideoCallModal.svelte';
  import { appSettings } from '$lib/shared/stores/appSettings.store.svelte';
  import { uiState } from '$lib/shared/stores/ui.store.svelte';
  import { authStore } from '$lib/shared/stores/auth.store.svelte';

  // Tab check
  let isTabLocked = $state(false);

  onMount(async () => {
    isTabLocked = !(await acquireTabLock());
    appSettings.init();
    if (!authStore.username) {
      uiState.isNameModalOpen = true;
    }
  });

  function handleNameSet(name: string) {
    authStore.setUsername(name);
    uiState.isNameModalOpen = false;
  }

  async function handleRetryTabLock() {
    isTabLocked = !(await acquireTabLock());
  }
</script>

<main>
  <ToastContainer />
  <SettingsModal />
  <VideoCallModal />

  {#if isTabLocked}
    <TabBlocked onRetry={handleRetryTabLock} />
  {:else if !authStore.username || uiState.isNameModalOpen}
    <NameModal
      onNameSet={handleNameSet}
      onCancel={authStore.username ? () => (uiState.isNameModalOpen = false) : null}
      forceShow={!!authStore.username}
    />
  {:else if authStore.user}
    <MessengerLayout />
  {/if}

  {#if uiState.previewMedia?.type === 'image'}
    <ImagePreviewModal
      url={uiState.previewMedia.url}
      name={uiState.previewMedia.name || ''}
      onClose={() => (uiState.previewMedia = null)}
    />
  {:else if uiState.previewMedia?.type === 'video'}
    <VideoPreviewModal
      url={uiState.previewMedia.url}
      name={uiState.previewMedia.name || ''}
      onClose={() => (uiState.previewMedia = null)}
    />
  {/if}
</main>

<style>
  main {
    height: 100vh;
    height: 100dvh; /* iOS Safari: dynamic viewport height — không bị address bar che */
    width: 100%;
    overflow-x: hidden;
    overflow-y: hidden;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
</style>
