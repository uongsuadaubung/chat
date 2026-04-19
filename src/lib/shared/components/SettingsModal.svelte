<script lang="ts">
  import { onMount } from 'svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { appSettings, SCREEN_SHARE_PROFILES } from '$lib/shared/stores/appSettings.store.svelte';
  import { uiState } from '$lib/shared/stores/ui.store.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import SunIcon from '$lib/shared/components/icons/SunIcon.svelte';
  import MoonIcon from '$lib/shared/components/icons/MoonIcon.svelte';
  import LanguageIcon from '$lib/shared/components/icons/LanguageIcon.svelte';
  import ToggleOnIcon from '$lib/shared/components/icons/ToggleOnIcon.svelte';
  import ToggleOffIcon from '$lib/shared/components/icons/ToggleOffIcon.svelte';
  import { wakeLockManager } from '$lib/core/wakeLock';
  import { exportData, importData } from '$lib/core/backup';
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import { log } from '$lib/core/logger';
  import { clearAllMessagesFromDB } from '$lib/core/db';
  import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
  import TrashIcon from '$lib/shared/components/icons/TrashIcon.svelte';

  let isWakeLockSupported = $state(true);

  let activeTab = $state<'general' | 'media' | 'data'>('general');
  let isExporting = $state(false);
  let isImporting = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  onMount(() => {
    isWakeLockSupported = wakeLockManager.isSupported();
  });

  function toggleTheme() {
    const isDark = appSettings.settings.theme === 'dark';
    appSettings.update({ theme: isDark ? 'light' : 'dark' });
  }

  function handleClose() {
    uiState.isSettingsModalOpen = false;
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) handleClose();
  }

  function toggleLanguage() {
    i18n.setLocale(i18n.locale === 'vi' ? 'en' : 'vi');
  }

  function toggleKeepScreenOn() {
    appSettings.update({ keepScreenOn: !appSettings.settings.keepScreenOn });
  }

  async function handleExport() {
    try {
      isExporting = true;
      await exportData();
    } catch (err) {
      alert('Lỗi xuất dữ liệu: ' + err);
    } finally {
      isExporting = false;
    }
  }

  async function handleImport(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    if (!window.confirm(i18n.t('restoreConfirmDesc'))) {
      target.value = ''; // Reset input
      return;
    }

    try {
      isImporting = true;
      await importData(file);
      alert(i18n.t('restoreSuccess'));
      // Note: importData reloads the window on success
    } catch (err: unknown) {
      toast.error(i18n.t('restoreError'));
      log.sys.error('Lỗi khôi phục dữ liệu:', err);
    } finally {
      isImporting = false;
      target.value = '';
    }
  }

  async function handleClearData() {
    if (!window.confirm(i18n.t('clearDataConfirm'))) return;

    try {
      await clearAllMessagesFromDB();
      // Clear reactive state
      ctx.messages = {};
      ctx.incomingFiles.clear();
      ctx.outgoingFiles.clear();
      toast.success(i18n.t('clearDataSuccess'));
    } catch (err) {
      toast.error('Lỗi khi xóa dữ liệu');
      log.db.error('Clear data error:', err);
    }
  }
</script>

{#if uiState.isSettingsModalOpen}
  <div
    class="modal-backdrop"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal large">
      <div class="modal-header">
        <h3>{i18n.t('settings')}</h3>
        <button class="close-btn" aria-label={i18n.t('close')} onclick={handleClose}>
          <CloseIcon />
        </button>
      </div>

      <div class="modal-content-layout">
        <aside class="modal-sidebar">
          <button
            class="tab-btn"
            class:active={activeTab === 'general'}
            onclick={() => (activeTab = 'general')}
          >
            {i18n.t('tabGeneral')}
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === 'media'}
            onclick={() => (activeTab = 'media')}
          >
            {i18n.t('tabMedia')}
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === 'data'}
            onclick={() => (activeTab = 'data')}
          >
            {i18n.t('tabData')}
          </button>
        </aside>

        <div class="modal-body">
          {#if activeTab === 'general'}
            <div class="setting-item">
              <div class="setting-info">
                <span class="title">{i18n.t('theme')}</span>
                <span class="desc">{i18n.t('themeDesc')}</span>
              </div>
              <GlassButton size="sm" onclick={toggleTheme}>
                <div class="btn-content">
                  {#if appSettings.settings.theme === 'dark'}
                    <MoonIcon size="16" /> {i18n.t('dark')}
                  {:else}
                    <SunIcon size="16" /> {i18n.t('light')}
                  {/if}
                </div>
              </GlassButton>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <span class="title">{i18n.t('enableGlass')}</span>
                <span class="desc">{i18n.t('enableGlassDesc')}</span>
              </div>
              <GlassButton
                size="sm"
                onclick={() =>
                  appSettings.update({ enableGlass: !appSettings.settings.enableGlass })}
              >
                <div class="btn-content">
                  {#if appSettings.settings.enableGlass}
                    <ToggleOnIcon size="16" /> {i18n.t('on')}
                  {:else}
                    <ToggleOffIcon size="16" /> {i18n.t('off')}
                  {/if}
                </div>
              </GlassButton>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <span class="title">{i18n.t('language')}</span>
                <span class="desc">{i18n.t('languageDesc')}</span>
              </div>
              <GlassButton size="sm" onclick={toggleLanguage}>
                <div class="btn-content">
                  <LanguageIcon size="16" />
                  {i18n.locale === 'vi' ? i18n.t('langVi') : i18n.t('langEn')}
                </div>
              </GlassButton>
            </div>

            <div class="setting-item" class:disabled={!isWakeLockSupported}>
              <div class="setting-info">
                <span class="title">{i18n.t('keepScreenOn')}</span>
                <span class="desc"
                  >{isWakeLockSupported ? i18n.t('keepScreenOnDesc') : i18n.t('notSupported')}</span
                >
              </div>
              <GlassButton size="sm" disabled={!isWakeLockSupported} onclick={toggleKeepScreenOn}>
                <div class="btn-content">
                  {#if appSettings.settings.keepScreenOn}
                    <ToggleOnIcon size="16" /> {i18n.t('on')}
                  {:else}
                    <ToggleOffIcon size="16" /> {i18n.t('off')}
                  {/if}
                </div>
              </GlassButton>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <span class="title">{i18n.t('changeNameTitle')}</span>
                <span class="desc">{i18n.t('enterNameDesc')}</span>
              </div>
              <GlassButton
                size="sm"
                onclick={() => {
                  handleClose();
                  uiState.isNameModalOpen = true;
                }}
              >
                {i18n.t('changeNameTitle')}
              </GlassButton>
            </div>
          {:else if activeTab === 'media'}
            <div class="setting-item column-layout">
              <div class="setting-info">
                <span class="title">{i18n.t('screenQuality')}</span>
                <span class="desc">{i18n.t('screenQualityDesc')}</span>
              </div>

              <div class="radio-panel">
                <button
                  class="radio-card"
                  class:active={appSettings.settings.screenShareProfile ===
                    SCREEN_SHARE_PROFILES.DETAIL}
                  onclick={() =>
                    appSettings.update({ screenShareProfile: SCREEN_SHARE_PROFILES.DETAIL })}
                >
                  <div class="r-title">{i18n.t('qualityDetail')}</div>
                  <div class="r-desc">{i18n.t('qualityDetailDesc')}</div>
                </button>

                <button
                  class="radio-card"
                  class:active={appSettings.settings.screenShareProfile ===
                    SCREEN_SHARE_PROFILES.MOTION}
                  onclick={() =>
                    appSettings.update({ screenShareProfile: SCREEN_SHARE_PROFILES.MOTION })}
                >
                  <div class="r-title">{i18n.t('qualityMotion')}</div>
                  <div class="r-desc">{i18n.t('qualityMotionDesc')}</div>
                </button>
              </div>
            </div>
          {:else if activeTab === 'data'}
            <div class="setting-item">
              <div class="setting-info">
                <span class="title">{i18n.t('backupData')}</span>
                <span class="desc">{i18n.t('backupDesc')}</span>
              </div>
              <GlassButton size="sm" onclick={handleExport} disabled={isExporting}>
                {isExporting ? i18n.t('statusSending') : i18n.t('exportBtn')}
              </GlassButton>
            </div>
            <div class="setting-item">
              <div class="setting-info">
                <span class="title">{i18n.t('restoreData')}</span>
                <span class="desc">{i18n.t('restoreDesc')}</span>
              </div>
              <input
                type="file"
                accept=".zip"
                bind:this={fileInput}
                style="display: none;"
                onchange={handleImport}
              />
              <GlassButton size="sm" onclick={() => fileInput?.click()} disabled={isImporting}>
                {isImporting ? i18n.t('downloading') : i18n.t('importBtn')}
              </GlassButton>
            </div>

            <div class="setting-item danger-zone">
              <div class="setting-info">
                <span class="title">{i18n.t('clearData')}</span>
                <span class="desc">{i18n.t('clearDataDesc')}</span>
              </div>
              <GlassButton size="sm" variant="danger" onclick={handleClearData}>
                <div class="btn-content">
                  <TrashIcon size="16" />
                  {i18n.t('clearDataBtn')}
                </div>
              </GlassButton>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop-bg);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  }

  .modal {
    background: var(--glass-bg);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);

    @media (max-width: 768px) {
      background: rgba(var(--color-white-rgb), 0.6);
      :global([data-theme='dark']) & {
        background: rgba(var(--color-slate-800-rgb), 0.9);
      }
    }
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    width: 420px; /* Default Fallback */
    max-width: calc(100vw - 2rem);
    max-height: calc(100dvh - 2rem);
    box-shadow: 0 25px 60px rgba(var(--color-black-rgb), 0.4);
    animation: popIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
    display: flex;
    flex-direction: column;

    &.large {
      width: 650px;
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--glass-border);
    background: rgba(var(--color-black-rgb), 0.02);

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
      color: var(--text-muted);
      padding: 6px;
      border-radius: 8px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        background: rgba(var(--color-red-500-rgb), 0.1);
        color: var(--color-red-500);
      }
    }
  }

  .modal-content-layout {
    display: flex;
    flex-direction: column;
    flex: 1 0 auto;
    overflow: hidden;
    height: 420px; /* Khóa cứng chiều cao trên mọi thiết bị */
    min-height: 420px;

    @media (min-width: 600px) {
      flex-direction: row;
    }
  }

  .modal-sidebar {
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    padding: 1rem;
    gap: 0.5rem;
    border-bottom: 1px solid var(--glass-border);
    background: rgba(var(--color-black-rgb), 0.01);

    @media (min-width: 600px) {
      flex-direction: column;
      width: 220px;
      border-bottom: none;
      border-right: 1px solid var(--glass-border);
    }

    .tab-btn {
      padding: 0.8rem 1rem;
      border-radius: 10px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.95rem;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;

      :global([data-theme='light']) & {
        color: var(--color-slate-800);
      }

      &:hover {
        background: rgba(var(--color-gray-500-rgb), 0.08);
        color: var(--text-main);
      }

      &.active {
        background: rgba(var(--color-blue-500-rgb), 0.1);
        color: var(--accent-color);
      }
    }
  }

  .modal-body {
    flex: 1;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.25rem;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 12px;
      gap: 1rem;
      transition: border-color 0.2s;

      &:hover {
        border-color: rgba(var(--color-gray-500-rgb), 0.4);
      }

      &.column-layout {
        flex-direction: column;
        align-items: flex-start;
      }

      &.disabled {
        opacity: 0.6;
        pointer-events: none;
      }

      .setting-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;

        .title {
          font-weight: 700;
          color: var(--text-main);
          font-size: 1rem;
          word-break: break-word;
        }
        .desc {
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.4;

          :global([data-theme='light']) & {
            color: var(--color-slate-800);
          }
        }
      }

      :global(.glass-btn:not(.size-lg):not(.size-md)) {
        min-width: 140px;
        justify-content: center;
        flex-shrink: 0;
      }

      .btn-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .radio-panel {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        width: 100%;
        margin-top: 0.5rem;

        .radio-card {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 1rem;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          gap: 6px;

          &:hover {
            border-color: var(--accent-color);
            background: rgba(var(--color-blue-500-rgb), 0.05);
          }

          &.active {
            border-color: var(--accent-color);
            background: rgba(var(--color-blue-500-rgb), 0.1);
            box-shadow: 0 0 0 1px var(--accent-color);

            .r-title {
              color: var(--accent-color);
            }
          }

          .r-title {
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-main);
          }

          .r-desc {
            font-size: 0.85rem;
            color: var(--text-muted);
            line-height: 1.4;
          }
        }
      }

      &.danger-zone {
        border-color: rgba(var(--color-red-500-rgb), 0.2);
        background: rgba(var(--color-red-500-rgb), 0.02);

        &:hover {
          border-color: rgba(var(--color-red-500-rgb), 0.4);
          background: rgba(var(--color-red-500-rgb), 0.05);
        }

        .title {
          color: var(--error-color);
        }
      }
    }
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
</style>
