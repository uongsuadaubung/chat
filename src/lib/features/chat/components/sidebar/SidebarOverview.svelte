<script lang="ts">
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { getSharedFiles, getPinnedMessages } from '$lib/core/db';
  import type { StoredChatMessage } from '$lib/core/db';
  import { log } from '$lib/core/logger';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import { contactsStore } from '$lib/features/chat/stores/contact.store.svelte';
  import { DatabaseError } from '$lib/core/db';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import SearchIcon from '$lib/shared/components/icons/SearchIcon.svelte';
  import PinIcon from '$lib/shared/components/icons/PinIcon.svelte';
  import FileIcon from '$lib/shared/components/icons/FileIcon.svelte';
  import UserPlusIcon from '$lib/shared/components/icons/UserPlusIcon.svelte';
  import UserMinusIcon from '$lib/shared/components/icons/UserMinusIcon.svelte';
  import LockIcon from '$lib/shared/components/icons/LockIcon.svelte';
  import SidebarMediaItem from '$lib/features/chat/components/sidebar/SidebarMediaItem.svelte';

  let files = $state<StoredChatMessage[]>([]);
  let pinnedMessagesCount = $state<number>(0);
  let activeTab = $state<'media' | 'docs'>('media');
  let isLoadingFiles = $state(false);

  let mediaFiles = $derived(files.filter((f) => /^image\/|^video\//.test(f.file?.mimeType || '')));
  let docFiles = $derived(files.filter((f) => !/^image\/|^video\//.test(f.file?.mimeType || '')));

  async function loadData() {
    if (!chatStore.selectedPeerId) return;
    isLoadingFiles = true;
    try {
      const myId = ctx.currentUser?.id;
      let rawFiles = await getSharedFiles(chatStore.selectedPeerId);
      let rawPinned = await getPinnedMessages(chatStore.selectedPeerId);

      if (myId) {
        rawFiles = rawFiles.filter((m) => !m.hiddenFromPeers?.includes(myId));
        rawPinned = rawPinned.filter((m) => !m.hiddenFromPeers?.includes(myId));
      }

      files = rawFiles;
      pinnedMessagesCount = rawPinned.length;
    } catch (e) {
      log.db.error('Error loading sidebar overview data:', e);
      toast.error(i18n.t('sidebarDataLoadError'));
    } finally {
      isLoadingFiles = false;
    }
  }

  $effect(() => {
    const peerId = chatStore.selectedPeerId;

    if (peerId && webrtc.messages[peerId]) {
      webrtc.messages[peerId].forEach((m) => {
        return m.isDeleted || m.isPinned || m.hiddenFromPeers;
      });
    }

    if (peerId) {
      loadData();
    }
  });

  function handleFileClick(msg: StoredChatMessage) {
    chatStore.scrollToMessageId = msg.id;
  }

  let isContact = $derived(
    chatStore.selectedPeerId ? contactsStore.isContact(chatStore.selectedPeerId) : false
  );

  /** Peer đang online hiện tại (dùng để lấy màu khi thêm danh bạ) */
  let selectedPeer = $derived(webrtc.peer.find((p) => p.id === chatStore.selectedPeerId));

  let isContactLoading = $state(false);

  async function handleAddContact() {
    if (!chatStore.selectedPeerId || !selectedPeer) return;
    isContactLoading = true;
    try {
      await contactsStore.add(selectedPeer);
      toast.success(i18n.t('contactAdded'));
    } catch (err) {
      log.db.error('Lỗi thêm danh bạ:', err);
      if (err instanceof DatabaseError) {
        toast.error(i18n.t('sidebarDataLoadError'));
      } else {
        toast.error(i18n.t('sidebarDataLoadError'));
      }
    } finally {
      isContactLoading = false;
    }
  }

  async function handleRemoveContact() {
    if (!chatStore.selectedPeerId) return;
    isContactLoading = true;
    try {
      await contactsStore.remove(chatStore.selectedPeerId);
      toast.success(i18n.t('contactRemoved'));
    } catch (err) {
      log.db.error('Lỗi xóa danh bạ:', err);
      if (err instanceof DatabaseError) {
        toast.error(i18n.t('sidebarDataLoadError'));
      } else {
        toast.error(i18n.t('sidebarDataLoadError'));
      }
    } finally {
      isContactLoading = false;
    }
  }
</script>

<div class="header">
  <h3>{i18n.t('roomInfo')}</h3>
  <button class="icon-btn" onclick={() => (chatStore.showRightSidebar = false)}>
    <CloseIcon size={20} />
  </button>
</div>

<div class="content scroll-y">
  <div class="action-grid">
    <button class="action-btn" onclick={() => (chatStore.sidebarView = 'search')}>
      <div class="icon-circle"><SearchIcon size={20} /></div>
      <span>{i18n.t('searchLabel')}</span>
    </button>
    <button class="action-btn" onclick={() => (chatStore.sidebarView = 'pinned')}>
      <div class="icon-circle"><PinIcon size={20} /></div>
      <span>{i18n.t('pinnedLabel')} ({pinnedMessagesCount})</span>
    </button>
    {#if isContact}
      <button
        class="action-btn contact-remove"
        onclick={handleRemoveContact}
        disabled={isContactLoading}
        aria-label={i18n.t('removeContact')}
      >
        <div class="icon-circle contact-remove-circle"><UserMinusIcon size={20} /></div>
        <span>{i18n.t('removeContact')}</span>
      </button>
    {:else if selectedPeer}
      <button
        class="action-btn contact-add"
        onclick={handleAddContact}
        disabled={isContactLoading}
        aria-label={i18n.t('addContact')}
      >
        <div class="icon-circle contact-add-circle"><UserPlusIcon size={20} /></div>
        <span>{i18n.t('addContact')}</span>
      </button>
    {/if}
  </div>

  <div class="encryption-card">
    <LockIcon size={16} />
    <p>{i18n.t('encryptionNotice')}</p>
  </div>

  <hr class="divider" />

  <div class="section">
    <h4 class="section-title"><FileIcon size={16} /> {i18n.t('filesAndMedia')}</h4>
    <div class="tabs">
      <button
        class="tab-btn"
        class:active={activeTab === 'media'}
        onclick={() => (activeTab = 'media')}
        >{i18n.t('photosAndVideos')} ({mediaFiles.length})</button
      >
      <button
        class="tab-btn"
        class:active={activeTab === 'docs'}
        onclick={() => (activeTab = 'docs')}>{i18n.t('documents')} ({docFiles.length})</button
      >
    </div>

    {#if isLoadingFiles}
      <p class="loading">{i18n.t('loadingPlaceholder')}</p>
    {:else if activeTab === 'media'}
      <div class="media-grid">
        {#each mediaFiles as msg (msg.id)}
          <SidebarMediaItem {msg} onClick={handleFileClick} />
        {/each}
      </div>
      {#if mediaFiles.length === 0}
        <p class="empty-text">{i18n.t('noPhotosOrVideos')}</p>
      {/if}
    {:else}
      <div class="list">
        {#each docFiles as msg (msg.id)}
          <button class="doc-row" onclick={() => handleFileClick(msg)}>
            <FileIcon size={24} />
            <div class="doc-info">
              <span class="doc-name">{msg.file?.name}</span>
              <span class="doc-size">{Math.round((msg.file?.size || 0) / 1024)} KB</span>
            </div>
          </button>
        {/each}
      </div>
      {#if docFiles.length === 0}
        <p class="empty-text">{i18n.t('noDocuments')}</p>
      {/if}
    {/if}
  </div>
</div>

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--glass-border);
    gap: 0.5rem;
    h3 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-main);
      flex: 1;
      margin: 0;
      text-align: center;
    }
  }
  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-main);
    padding: 0.4rem;
    border-radius: 8px;
    display: flex;
    &:hover {
      background: rgba(var(--color-black-rgb), 0.05);
    }
  }
  .content {
    flex: 1;
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .scroll-y {
    overflow-y: auto;
    padding: 1rem;
  }
  .action-grid {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-top: 1rem;
  }
  .action-btn {
    background: none;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: var(--text-main);
    transition: opacity 0.2s;
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .icon-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(var(--color-black-rgb), 0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      color: var(--color-indigo-600);
    }
    &:hover:not(:disabled) .icon-circle {
      background: rgba(var(--color-black-rgb), 0.1);
    }
    span {
      font-size: 0.8rem;
      font-weight: 500;
    }
    &.contact-add {
      color: var(--color-indigo-600);
      .contact-add-circle {
        background: rgba(var(--color-indigo-500-rgb), 0.1);
        color: var(--color-indigo-600);
      }
      &:hover:not(:disabled) .contact-add-circle {
        background: rgba(var(--color-indigo-500-rgb), 0.2);
      }
    }
    &.contact-remove {
      color: var(--color-red-500);
      .contact-remove-circle {
        background: rgba(var(--color-red-500-rgb), 0.08);
        color: var(--color-red-500);
      }
      &:hover:not(:disabled) .contact-remove-circle {
        background: rgba(var(--color-red-500-rgb), 0.15);
      }
    }
  }

  .encryption-card {
    margin-top: 1.5rem;
    padding: 1rem;
    background: rgba(var(--color-indigo-500-rgb), 0.05);
    border: 1px solid rgba(var(--color-indigo-500-rgb), 0.1);
    border-radius: 12px;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    color: var(--text-main);

    p {
      margin: 0;
      font-size: 0.85rem;
      line-height: 1.4;
      font-weight: 500;
      color: var(--text-muted);
    }

    :global(svg) {
      color: var(--color-indigo-500);
      flex-shrink: 0;
      margin-top: 2px;
    }
  }

  .divider {
    border: 0;
    border-top: 1px solid var(--glass-border);
    margin: 1.5rem 0;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    flex: 1;
  }
  .section-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-main);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .empty-text {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
    margin: 1rem 0;
  }
  .tabs {
    display: flex;
    gap: 0.5rem;
    background: rgba(var(--color-black-rgb), 0.05);
    padding: 0.25rem;
    border-radius: 20px;
  }
  .tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    border-radius: 16px;
    padding: 0.4rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
    &.active {
      background: var(--glass-bg);
      color: var(--text-main);
      box-shadow: 0 1px 3px rgba(var(--color-black-rgb), 0.1);
    }
  }
  .media-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .doc-row {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.6rem;
    background: transparent;
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    &:hover {
      background: rgba(var(--color-black-rgb), 0.02);
    }
    .doc-info {
      flex: 1;
      overflow: hidden;
    }
    .doc-name {
      display: block;
      font-size: 0.85rem;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }
    .doc-size {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
  }
  .loading {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
    margin: 2rem 0;
  }
</style>
