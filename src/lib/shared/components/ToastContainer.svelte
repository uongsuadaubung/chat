<script lang="ts">
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import AlertTriangleIcon from '$lib/shared/components/icons/AlertTriangleIcon.svelte';
  import CheckCircleIcon from '$lib/shared/components/icons/CheckCircleIcon.svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
</script>

<div class="toast-container">
  {#each toast.toasts as t (t.id)}
    <div
      class="toast-item {t.type}"
      in:fly={{ y: -20, duration: 300 }}
      out:fade={{ duration: 200 }}
      animate:flip={{ duration: 250 }}
    >
      <div class="icon">
        {#if t.type === 'error' || t.type === 'warning'}
          <AlertTriangleIcon size={18} />
        {:else if t.type === 'success'}
          <CheckCircleIcon size={18} />
        {:else}
          <div class="info-dot"></div>
        {/if}
      </div>
      <span class="message">{t.message}</span>
      <button class="close-btn" onclick={() => toast.remove(t.id)}>
        <CloseIcon size={16} />
      </button>
    </div>
  {/each}
</div>

<style lang="scss">
  .toast-container {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    pointer-events: none;
  }

  .toast-item {
    pointer-events: auto;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    border-radius: 12px;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.9rem;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(var(--color-black-rgb), 0.1);
    min-width: 300px;
    max-width: 90vw;

    &.error {
      background: rgba(var(--color-danger-rgb), 0.15);
      border-color: rgba(var(--color-danger-rgb), 0.3);
      color: var(--color-red-500);
    }

    &.warning {
      background: rgba(var(--color-warning-rgb), 0.15);
      border-color: rgba(var(--color-warning-rgb), 0.3);
      color: var(--color-amber-500);
    }

    &.success {
      background: rgba(var(--color-success-rgb), 0.15);
      border-color: rgba(var(--color-success-rgb), 0.3);
      color: var(--color-emerald-500);
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .info-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-main);
    }

    .message {
      flex: 1;
    }

    .close-btn {
      background: none;
      border: none;
      color: inherit;
      opacity: 0.7;
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      transition:
        opacity 0.2s,
        background 0.2s;

      &:hover {
        opacity: 1;
        background: rgba(var(--color-black-rgb), 0.1);
      }
    }
  }
</style>
