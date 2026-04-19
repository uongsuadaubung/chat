<script lang="ts">
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import SidebarOverview from '$lib/features/chat/components/sidebar/SidebarOverview.svelte';
  import SidebarPinned from '$lib/features/chat/components/sidebar/SidebarPinned.svelte';
  import SidebarSearch from '$lib/features/chat/components/sidebar/SidebarSearch.svelte';
</script>

<div class="room-info-sidebar" class:open={chatStore.showRightSidebar}>
  {#if chatStore.showRightSidebar || true}
    <!-- Luôn render hoặc giữ DOM để animate -->
    <div class="sidebar-content-wrapper">
      {#if chatStore.sidebarView === 'overview'}
        <SidebarOverview />
      {:else if chatStore.sidebarView === 'pinned'}
        <SidebarPinned />
      {:else if chatStore.sidebarView === 'search'}
        <SidebarSearch />
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .room-info-sidebar {
    width: 320px;
    background: var(--glass-bg);
    border-left: 1px solid var(--glass-border);
    display: flex;
    flex-direction: column;
    height: 100%;
    z-index: 100;
    transition:
      width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.2s ease;
    overflow: hidden;
    flex-shrink: 0;

    .sidebar-content-wrapper {
      width: 320px;
      height: 100%;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    &:not(.open) {
      width: 0;
      border-left-width: 0;
      opacity: 0;
      pointer-events: none;
    }

    &.open {
      opacity: 1;
      width: 320px;
    }

    @media (max-width: 768px) {
      position: fixed;
      top: 0;
      right: 0;
      width: 100% !important;
      transform: translateX(100%);
      opacity: 1;
      border-left: none;
      z-index: 1000;

      .sidebar-content-wrapper {
        width: 100%;
      }

      &.open {
        transform: translateX(0);
      }

      /* Make glass background more opaque on mobile for readability */
      background: rgba(var(--color-white-rgb), 0.5);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);

      :global([data-theme='dark']) & {
        background: rgba(var(--color-slate-800-rgb), 0.8);
      }

      &:not(.open) {
        width: 100% !important;
        transform: translateX(100%);
      }
    }
  }
</style>
