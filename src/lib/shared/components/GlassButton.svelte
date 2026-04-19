<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    variant?: 'default' | 'round' | 'pill' | 'circle' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    fullWidth?: boolean;
    href?: string;
    download?: string;
    ariaLabel?: string;
    className?: string;
    children: Snippet;
  }

  let {
    onclick,
    disabled = false,
    variant = 'default',
    size = 'md',
    fullWidth = false,
    href,
    download,
    ariaLabel,
    className = '',
    children
  }: Props = $props();
</script>

{#if href}
  <a
    {href}
    {download}
    class="glass-btn {variant} size-{size} {className}"
    class:full-width={fullWidth}
    aria-label={ariaLabel}
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    class="glass-btn {variant} size-{size} {className}"
    class:full-width={fullWidth}
    {disabled}
    {onclick}
    aria-label={ariaLabel}
  >
    {@render children()}
  </button>
{/if}

<style lang="scss">
  .glass-btn {
    background: var(--glass-bg);
    color: var(--text-main);
    border: 1px solid var(--glass-border);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-decoration: none;
    font-family: inherit;

    &:hover:not(:disabled) {
      background: rgba(var(--color-gray-500-rgb), 0.15);
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Sizes */
    &.size-sm {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      border-radius: 8px;
    }

    &.size-md {
      padding: 0.7rem 1.2rem;
      font-size: 0.95rem;
      border-radius: 10px;
    }

    &.size-lg {
      padding: 0.9rem 1.5rem;
      font-size: 1.05rem;
      border-radius: 12px;
    }

    /* Variants override border-radius */
    &.round {
      border-radius: 12px;
    }
    &.pill {
      border-radius: 99px;
    }
    &.circle {
      border-radius: 50%;
      padding: 0.5rem;
      width: 40px;
      height: 40px;
    }

    &.danger {
      color: var(--error-color);
      border-color: rgba(var(--color-red-500-rgb), 0.2);

      &:hover:not(:disabled) {
        background: rgba(var(--color-red-500-rgb), 0.1);
        border-color: rgba(var(--color-red-500-rgb), 0.4);
      }
    }

    &.full-width {
      width: 100%;
    }
  }
</style>
