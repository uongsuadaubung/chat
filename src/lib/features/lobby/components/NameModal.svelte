<script lang="ts">
  import { onMount } from 'svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import { importData } from '$lib/core/backup';
  import { toast } from '$lib/shared/stores/toast.store.svelte';

  interface Props {
    onNameSet: (name: string) => void;
    onCancel?: (() => void) | null;
    forceShow?: boolean;
  }
  let { onNameSet, onCancel = null, forceShow = false }: Props = $props();

  let inputName = $state('');
  let error = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  let fileInputEl: HTMLInputElement | undefined = $state();
  let isImporting = $state(false);

  onMount(() => {
    const savedName = localStorage.getItem('username');
    if (savedName && !forceShow) {
      onNameSet(savedName);
    } else {
      inputName = savedName ?? '';
      inputEl?.focus();
    }
  });

  function saveName() {
    const name = inputName.trim();
    if (name.length < 2) {
      error = i18n.t('nameErrorLength');
      return;
    }
    localStorage.setItem('username', name);
    onNameSet(name);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveName();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onCancel?.();
  }

  function handleBackdropKeydown(e: KeyboardEvent) {
    if (e.target === e.currentTarget && e.key === 'Escape') {
      onCancel?.();
    }
  }

  function triggerImport() {
    fileInputEl?.click();
  }

  async function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error(i18n.t('restoreError'));
      return;
    }

    try {
      isImporting = true;
      await importData(file);
      // Giữ trạng thái đang tải chờ trình duyệt reload trong importData
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(i18n.t('restoreError') + ' ' + message);
      isImporting = false;
    }
  }
</script>

<div
  class="modal-backdrop"
  role="presentation"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="name-modal-title">
    <div class="modal-header">
      <h3 id="name-modal-title">{i18n.t('welcome')}</h3>
      {#if onCancel}
        <button class="close-btn" onclick={onCancel} aria-label={i18n.t('close')}>
          <CloseIcon />
        </button>
      {/if}
    </div>

    <div class="modal-body">
      <p>{i18n.t('enterNameDesc')}</p>
      <div class="input-group">
        <input
          type="text"
          bind:this={inputEl}
          bind:value={inputName}
          onkeydown={onKeyDown}
          placeholder={i18n.t('namePlaceholder')}
        />
        {#if error}
          <span class="error">{error}</span>
        {/if}
        <input
          type="file"
          accept=".zip"
          style="display: none"
          bind:this={fileInputEl}
          onchange={handleFileSelect}
        />
      </div>
    </div>

    <div class="modal-footer">
      {#if !forceShow}
        <button class="import-btn" onclick={triggerImport} disabled={isImporting}>
          {isImporting ? i18n.t('loadingPlaceholder') : i18n.t('importBtn')}
        </button>
      {/if}
      <GlassButton onclick={saveName}>{i18n.t('enterLobby')}</GlassButton>
    </div>
  </div>
</div>

<style lang="scss">
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop-bg);
    animation: fadeIn 0.2s ease;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
  }

  .modal {
    background: var(--glass-bg);

    @media (max-width: 768px) {
      background: rgba(var(--color-white-rgb), 0.6);
      :global([data-theme='dark']) & {
        background: rgba(var(--color-slate-800-rgb), 0.9);
      }
    }
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    width: 420px;
    max-width: calc(100vw - 2rem);
    box-shadow: 0 25px 60px rgba(var(--color-black-rgb), 0.4);
    animation: popIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
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
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 1.75rem 1rem;
    border-bottom: 1px solid var(--glass-border);
    h3 {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 800;
      color: var(--text-main);
    }
    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      color: var(--text-muted);
      display: flex;
      transition: all 0.15s;
      &:hover {
        background: rgba(var(--color-gray-500-rgb), 0.15);
        color: var(--text-main);
      }
    }
  }

  .modal-body {
    padding: 1.5rem 1.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    p {
      margin: 0 0 1rem;
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.5;

      :global([data-theme='light']) & {
        color: var(--color-slate-800);
      }
    }

    .input-group {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      margin-bottom: 0.5rem;

      input {
        width: 100%;
        padding: 0.85rem 1rem;
        border: 1px solid var(--input-border);
        border-radius: 12px;
        background: var(--input-bg);
        color: var(--text-main);
        font-size: 1.05rem;
        transition: all 0.2s;
        box-shadow: inset 0 2px 4px rgba(var(--color-black-rgb), 0.02);
        &:focus {
          outline: none;
          border-color: var(--accent-color);
          box-shadow: 0 0 0 4px rgba(var(--color-blue-500-rgb), 0.1);
        }
        &::placeholder {
          color: var(--text-muted);
        }
      }

      .error {
        color: var(--error-color);
        font-size: 0.85rem;
        margin-top: 0.5rem;
        font-weight: 500;
        animation: fadeIn 0.2s ease;
      }
    }
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.75rem 1.5rem;

    .import-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.95rem;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-weight: 500;
      transition: all 0.2s;
      margin-right: auto;

      &:hover:not(:disabled) {
        background: rgba(var(--color-gray-500-rgb), 0.15);
        color: var(--text-main);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
</style>
