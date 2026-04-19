<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import SettingsIcon from '$lib/shared/components/icons/SettingsIcon.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';
  import RefreshIcon from '$lib/shared/components/icons/RefreshIcon.svelte';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { uiState } from '$lib/shared/stores/ui.store.svelte';
  import { authStore } from '$lib/shared/stores/auth.store.svelte';
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { contactsStore } from '$lib/features/chat/stores/contact.store.svelte';
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import { log } from '$lib/core/logger';
  import UserAvatar from '$lib/shared/components/UserAvatar.svelte';

  onMount(async () => {
    try {
      await contactsStore.load();
    } catch (err) {
      log.db.error('Lỗi tải danh bạ:', err);
      toast.error(i18n.t('sidebarDataLoadError'));
    }
  });

  let unreadCounts = $derived.by(() => {
    const counts = new SvelteMap<string, number>();
    for (const [peerId, peerMessages] of Object.entries(webrtc.messages)) {
      let cnt = 0;
      for (let i = peerMessages.length - 1; i >= 0; i--) {
        const msg = peerMessages[i];
        if (msg.read) break; // Optimization: unread messages are always at the end
        if (!msg.isSelf) cnt++;
      }
      if (cnt > 0) counts.set(peerId, cnt);
    }
    return counts;
  });

  /** Người đang online KHÔNG có trong danh bạ */
  let onlineStrangers = $derived(webrtc.peer.filter((p) => !contactsStore.isContact(p.id)));

  /** Online peer IDs để kiểm tra O(1) trong contact list */
  let onlinePeerMap = $derived(new Map(webrtc.peer.map((p) => [p.id, p])));

  let isSidebarEmpty = $derived(!contactsStore.isLoaded && webrtc.peer.length === 0);
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <div class="header-top">
      <div
        class="self-profile"
        onclick={() => (uiState.isSettingsModalOpen = true)}
        title={i18n.t('settings')}
        role="button"
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === 'Enter') uiState.isSettingsModalOpen = true;
        }}
      >
        <UserAvatar name={authStore.username} userId={authStore.sessionId} size={40} />
        <div class="info">
          <span class="name">{authStore.user?.name || ''}</span>
        </div>
      </div>
      <button
        class="settings-btn"
        aria-label={i18n.t('settings')}
        onclick={() => (uiState.isSettingsModalOpen = true)}
      >
        <SettingsIcon size="20" />
      </button>
    </div>
  </div>

  <div class="peer-list">
    <!-- === SECTION: Đang online (không có trong danh bạ) === -->
    {#if onlineStrangers.length > 0}
      <div class="section-header">
        <span class="section-label">{i18n.t('onlineNonContacts')}</span>
        <span class="section-count">{onlineStrangers.length}</span>
      </div>
      {#each onlineStrangers as peer (peer.id)}
        <button
          class="peer-item"
          class:active={chatStore.selectedPeerId === peer.id}
          class:disabled={!peer.connected && !peer.hasFailed}
          class:failed={peer.hasFailed}
          onclick={() => {
            if (peer.connected || peer.hasFailed) {
              chatStore.selectPeer(peer.id);
            }
          }}
        >
          <UserAvatar name={peer.name} color={peer.color} size={44} />
          <div class="info">
            <span class="name">{peer.name}</span>
            <span
              class="status"
              class:online={peer.connected}
              class:connecting={!peer.connected && !peer.hasFailed}
              class:error={peer.hasFailed}
            >
              {peer.connected
                ? i18n.t('online')
                : peer.hasFailed
                  ? i18n.t('p2pFailed')
                  : i18n.t('p2pConnecting')}
            </span>
          </div>
          {#if peer.hasFailed}
            <GlassButton
              variant="circle"
              className="retry-badge"
              ariaLabel={i18n.t('retryConnection')}
              onclick={(e) => {
                e.stopPropagation();
                webrtc.retryConnection(peer.id);
              }}
            >
              <RefreshIcon size="16" />
            </GlassButton>
          {:else if unreadCounts.get(peer.id)}
            <div class="unread-badge">
              {unreadCounts.get(peer.id)! > 99 ? '99+' : unreadCounts.get(peer.id)}
            </div>
          {/if}
        </button>
      {/each}

      {#if contactsStore.contacts.length > 0}
        <div class="section-divider"></div>
      {/if}
    {/if}

    <!-- === SECTION: Danh bạ (luôn hiển thị) === -->
    {#if contactsStore.isLoaded}
      {#if contactsStore.contacts.length > 0}
        <div class="section-header">
          <span class="section-label">{i18n.t('contacts')}</span>
          <span class="section-count">{contactsStore.contacts.length}</span>
        </div>
        {#each contactsStore.contacts as contact (contact.peerId)}
          {@const onlinePeer = onlinePeerMap.get(contact.peerId)}
          {@const isOnline = !!onlinePeer?.connected}
          <button
            class="peer-item"
            class:active={chatStore.selectedPeerId === contact.peerId}
            class:failed={onlinePeer?.hasFailed}
            onclick={() => chatStore.selectPeer(contact.peerId)}
          >
            <UserAvatar name={contact.name} color={contact.color} size={44} />
            <div class="info">
              <span class="name">{contact.name}</span>
              <span
                class="status"
                class:online={isOnline}
                class:offline={!isOnline && !onlinePeer?.hasFailed}
                class:error={onlinePeer?.hasFailed}
              >
                {isOnline
                  ? i18n.t('online')
                  : onlinePeer?.hasFailed
                    ? i18n.t('p2pFailed')
                    : i18n.t('offline')}
              </span>
            </div>
            {#if onlinePeer?.hasFailed}
              <GlassButton
                variant="circle"
                className="retry-badge"
                ariaLabel={i18n.t('retryConnection')}
                onclick={(e) => {
                  e.stopPropagation();
                  webrtc.retryConnection(contact.peerId);
                }}
              >
                <RefreshIcon size="16" />
              </GlassButton>
            {:else if unreadCounts.get(contact.peerId)}
              <div class="unread-badge">
                {unreadCounts.get(contact.peerId)! > 99 ? '99+' : unreadCounts.get(contact.peerId)}
              </div>
            {/if}
          </button>
        {/each}
      {:else if onlineStrangers.length === 0}
        <!-- Không có ai online và danh bạ trống -->
        <div class="no-peer">
          <p>{i18n.t('noPeersOnline')}</p>
        </div>
      {/if}
    {/if}

    <!-- Không online và không có danh bạ -->
    {#if isSidebarEmpty}
      <div class="no-peer">
        <p>{i18n.t('noPeersOnline')}</p>
      </div>
    {/if}
  </div>
</aside>

<style lang="scss">
  .sidebar {
    width: 280px;
    height: 100vh;
    height: 100dvh;
    border-right: 1px solid var(--glass-border);
    display: flex;
    flex-direction: column;
    background: var(--sidebar-bg);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    flex-shrink: 0;

    @media (min-width: 768px) {
      width: 320px;
    }

    @media (max-width: 768px) {
      /* Make glass background more opaque on mobile for readability */
      background: rgba(var(--color-white-rgb), 0.5);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);

      :global([data-theme='dark']) & {
        background: rgba(var(--color-slate-800-rgb), 0.8);
      }
    }

    .sidebar-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--glass-border);
      display: flex;
      flex-direction: column;
      gap: 1rem;

      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .settings-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-radius: 50%;
          transition: all 0.3s ease;

          &:hover {
            background: rgba(var(--color-gray-500-rgb), 0.1);
            color: var(--text-main);
            transform: rotate(60deg);
          }
        }
      }

      .self-profile {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: opacity 0.2s;

        &:hover {
          opacity: 0.8;
        }

        .info {
          display: flex;
          flex-direction: column;
          gap: 2px;

          .name {
            font-weight: 700;
            color: var(--text-main);
            font-size: 1.1rem;
            max-width: 140px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
      }
    }

    .peer-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.25rem 0.5rem;
        margin-top: 0.25rem;

        .section-label {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .section-count {
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-muted);
          background: rgba(var(--color-gray-500-rgb), 0.12);
          padding: 1px 6px;
          border-radius: 99px;
        }
      }

      .section-divider {
        border-top: 1px solid var(--glass-border);
        margin: 0.25rem 0;
      }

      .peer-item {
        display: flex;
        align-items: center;
        padding: 0.75rem 1rem;
        gap: 14px;
        background: rgba(var(--color-white-rgb), 0.15);
        border: 1px solid var(--glass-border);
        border-radius: 14px;
        box-shadow: 0 2px 8px rgba(var(--color-black-rgb), 0.06);
        transition: all 0.2s;
        cursor: pointer;
        text-align: left;
        width: 100%;
        color: inherit;

        &:hover {
          background: rgba(var(--color-white-rgb), 0.25);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(var(--color-black-rgb), 0.1);
        }

        &.active {
          background: rgba(var(--color-indigo-500-rgb), 0.15);
          border-color: var(--accent-color);
          box-shadow: 0 0 0 2px rgba(var(--color-indigo-500-rgb), 0.3);
        }

        &.disabled {
          opacity: 0.6;
          cursor: not-allowed;
          &:hover {
            background: rgba(var(--color-white-rgb), 0.15);
            transform: none;
            box-shadow: 0 2px 8px rgba(var(--color-black-rgb), 0.06);
          }
        }

        &.failed {
          border-color: rgba(var(--color-red-500-rgb), 0.3);
          background: rgba(var(--color-red-500-rgb), 0.05);
        }

        .info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;

          .name {
            font-weight: 700;
            color: var(--text-main);
            font-size: 0.95rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .status {
            font-size: 0.8rem;
            font-weight: 500;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 4px;

            &::before {
              content: '';
              display: inline-block;
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: var(--color-gray-400);
            }

            &.online {
              color: var(--status-online-color);
              &::before {
                background: var(--status-online-color);
                box-shadow: 0 0 0 2px rgba(var(--color-emerald-500-rgb), 0.2);
              }
            }

            &.connecting {
              color: var(--status-connecting-color);
              &::before {
                background: var(--status-connecting-color);
              }
            }

            &.offline {
              color: var(--text-muted);
              &::before {
                background: var(--color-gray-400);
              }
            }

            &.error {
              color: var(--color-red-500);
              &::before {
                background: var(--color-red-500);
              }
            }
          }
        }

        :global(.retry-badge) {
          background: rgba(var(--color-red-500-rgb), 0.1) !important;
          color: var(--color-red-500) !important;
          border: none !important;
          cursor: pointer;
          margin-left: auto !important;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;

          &:hover {
            background: rgba(var(--color-red-500-rgb), 0.2) !important;
            transform: rotate(45deg);
          }
        }

        .unread-badge {
          background: var(--color-red-500);
          color: var(--color-white);
          font-size: 0.75rem;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 99px;
          min-width: 20px;
          text-align: center;
          margin-left: auto;
          box-shadow: 0 2px 4px rgba(var(--color-red-500-rgb), 0.3);
          animation: popOut 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
      }

      .no-peer {
        padding: 2rem 1rem;
        text-align: center;
        color: var(--text-muted);
        font-size: 0.95rem;
        line-height: 1.5;
        background: rgba(var(--color-white-rgb), 0.05);
        border-radius: 12px;
        border: 1px dashed var(--glass-border);
      }
    }
  }

  @keyframes popOut {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
