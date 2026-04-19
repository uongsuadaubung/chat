<script lang="ts">
  import { EMOJI_CATEGORIES } from '$lib/features/chat/constants/emoji.constant';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import SmileIcon from '$lib/shared/components/icons/SmileIcon.svelte';

  interface Props {
    onSelect: (emoji: string) => void;
  }
  let { onSelect }: Props = $props();

  let showMenu = $state(false);

  let activeCategoryIndex = $state(0);
  let tabsContainerEl: HTMLDivElement | undefined = $state();
  let isDown = $state(false);
  let isDragging = $state(false);
  let startX = $state(0);
  let scrollLeft = $state(0);

  function toggleMenu() {
    showMenu = !showMenu;
    if (showMenu) {
      activeCategoryIndex = 0;
    }
  }

  export function closeMenu() {
    showMenu = false;
  }

  function handleSelect(emoji: string) {
    onSelect(emoji);
  }

  // Mouse drag to scroll handlers for tabs
  function handleMouseDown(e: MouseEvent) {
    if (!tabsContainerEl) return;
    isDown = true;
    isDragging = false;
    startX = e.pageX - tabsContainerEl.offsetLeft;
    scrollLeft = tabsContainerEl.scrollLeft;
  }

  function handleMouseLeave() {
    isDown = false;
    isDragging = false;
  }

  function handleMouseUp() {
    isDown = false;
    setTimeout(() => {
      isDragging = false;
    }, 0);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDown || !tabsContainerEl) return;
    const x = e.pageX - tabsContainerEl.offsetLeft;

    if (Math.abs(x - startX) > 3) {
      isDragging = true;
    }

    if (isDragging) {
      e.preventDefault();
      const walk = (x - startX) * 1; // scroll speed multiplier
      tabsContainerEl.scrollLeft = scrollLeft - walk;
    }
  }
  import { clickOutside } from '$lib/shared/actions/clickOutside';
</script>

<div class="emoji-container" use:clickOutside={closeMenu}>
  <button class="attach-btn" aria-label="Emojis" onclick={toggleMenu}>
    <SmileIcon />
  </button>

  {#if showMenu}
    <div class="emoji-menu">
      <div
        class="category-tabs"
        class:is-dragging={isDragging}
        bind:this={tabsContainerEl}
        onmousedown={handleMouseDown}
        onmouseleave={handleMouseLeave}
        onmouseup={handleMouseUp}
        onmousemove={handleMouseMove}
        role="tablist"
        tabindex="-1"
      >
        {#each EMOJI_CATEGORIES as group, i (group.key)}
          <button
            class="tab-btn"
            class:active={activeCategoryIndex === i}
            title={i18n.t(group.key as Parameters<typeof i18n.t>[0])}
            onclick={() => (activeCategoryIndex = i)}
          >
            {group.emojis[0]}
          </button>
        {/each}
      </div>

      <div class="emoji-scroll-container">
        <div class="emoji-header">
          {i18n.t(EMOJI_CATEGORIES[activeCategoryIndex].key as Parameters<typeof i18n.t>[0])}
        </div>
        <div class="emoji-grid">
          {#each EMOJI_CATEGORIES[activeCategoryIndex].emojis as emoji, i (i)}
            <button class="emoji-btn" onclick={() => handleSelect(emoji)}>{emoji}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .emoji-container {
    position: relative;
    display: flex;
    align-items: center;

    .attach-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      transition: all 0.2s;
      margin-right: 8px;

      &:hover {
        background: rgba(var(--color-gray-500-rgb), 0.1);
        color: var(--accent-color);
      }
    }

    .emoji-menu {
      position: absolute;
      bottom: calc(100% + 15px);
      left: 0;
      background: var(--glass-bg);
      -webkit-backdrop-filter: var(--glass-blur);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 25px rgba(var(--color-black-rgb), 0.15);
      z-index: 100;
      width: 340px;
      max-width: calc(100vw - 32px);
      animation: popUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);

      @media (max-width: 768px) {
        left: -44px; /* Offset the width of the + button and margins */
        width: calc(100vw - 32px);
      }

      .category-tabs {
        display: flex;
        gap: 4px;
        padding-bottom: 8px;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--glass-border);
        overflow-x: auto;
        cursor: grab;
        user-select: none;

        &.is-dragging {
          cursor: grabbing;
          .tab-btn {
            pointer-events: none;
          }
        }

        &::-webkit-scrollbar {
          height: 3px;
        }
        &::-webkit-scrollbar-track {
          background: transparent;
        }
        &::-webkit-scrollbar-thumb {
          background: rgba(var(--color-gray-500-rgb), 0.3);
          border-radius: 4px;
        }

        .tab-btn {
          background: transparent;
          border: none;
          font-size: 1.1rem;
          padding: 6px 8px;
          border-radius: 8px;
          cursor: pointer;
          opacity: 0.6;
          transition: all 0.2s;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;

          &:hover {
            opacity: 1;
            background: rgba(var(--color-gray-500-rgb), 0.1);
          }

          &.active {
            opacity: 1;
            background: rgba(var(--color-gray-500-rgb), 0.2);
            box-shadow: inset 0 -2px 0 var(--accent-color);
          }
        }
      }

      .emoji-scroll-container {
        height: 200px;
        overflow-y: auto;
        padding-right: 4px;

        &::-webkit-scrollbar {
          width: 4px;
        }
        &::-webkit-scrollbar-track {
          background: transparent;
        }
        &::-webkit-scrollbar-thumb {
          background: rgba(var(--color-gray-500-rgb), 0.3);
          border-radius: 4px;
        }
      }

      .emoji-header {
        font-size: 0.8rem;
        color: var(--text-muted);
        margin: 0 0 6px 4px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .emoji-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
        gap: 4px;
      }

      .emoji-btn {
        background: transparent;
        border: none;
        font-size: 1.4rem;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        cursor: pointer;
        transition:
          background 0.15s,
          transform 0.1s;

        &:hover {
          background: rgba(var(--color-gray-500-rgb), 0.2);
          transform: scale(1.1);
        }
      }
    }
  }

  @keyframes popUp {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
