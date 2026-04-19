<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import AttachMenu from '$lib/features/chat/components/AttachMenu.svelte';
  import EmojiMenu from '$lib/features/chat/components/EmojiMenu.svelte';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import { ACCEPT_IMAGE_VIDEO, ACCEPT_FILES } from '$lib/features/chat/constants/chat.constant';
  import type { Snippet } from 'svelte';

  interface Props {
    onFileSelect: (file: File) => void;
    onEmojiSelect: (emoji: string) => void;
    onScreenShareToggle: () => void;
    isCallActive: boolean;
    isScreenShareDisabled: boolean;
    isScreenSharing: boolean;
    pendingImage: File | null;
    previewSnippet?: Snippet<[Snippet]>;
    controlsSnippet?: Snippet<[Snippet]>;
  }
  let {
    onFileSelect,
    onEmojiSelect,
    onScreenShareToggle,
    isCallActive,
    isScreenShareDisabled,
    isScreenSharing,
    pendingImage = $bindable(),
    previewSnippet,
    controlsSnippet
  }: Props = $props();

  let fileInputEl: HTMLInputElement | undefined;
  let previewUrl = $state<string | null>(null);

  $effect(() => {
    if (pendingImage) {
      const url = URL.createObjectURL(pendingImage);
      previewUrl = url;
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      previewUrl = null;
    }
  });

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files?.[0]) {
      onFileSelect(target.files[0]);
      target.value = '';
    }
  }

  function triggerFile(accept: string) {
    if (fileInputEl) {
      fileInputEl.accept = accept;
      fileInputEl.click();
    }
  }

  export function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return false;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          pendingImage = new File([file], `paste_${Date.now()}.png`, { type: item.type });
          return true; // handled
        }
      }
    }
    return false;
  }
</script>

{#snippet preview()}
  {#if pendingImage && previewUrl}
    <div class="image-preview">
      <img src={previewUrl} alt="Preview" />
      <div class="info">
        <span class="label">{i18n.t('pasteImageLabel')}</span>
        <span class="name">{pendingImage.name}</span>
      </div>
      <button class="close-btn" onclick={() => (pendingImage = null)}
        ><CloseIcon size={16} /></button
      >
    </div>
  {/if}
{/snippet}

{#snippet controls()}
  <div class="controls">
    <AttachMenu
      onImageSelect={() => triggerFile(ACCEPT_IMAGE_VIDEO)}
      onFileSelect={() => triggerFile(ACCEPT_FILES)}
      onScreenShareSelect={onScreenShareToggle}
      hideScreenShare={isCallActive}
      {isScreenShareDisabled}
      {isScreenSharing}
    />
    <EmojiMenu onSelect={onEmojiSelect} />
    <input type="file" class="hidden" bind:this={fileInputEl} onchange={handleFileChange} />
  </div>
{/snippet}

{#if previewSnippet}
  {@render previewSnippet(preview)}
{:else}
  {@render preview()}
{/if}

{#if controlsSnippet}
  {@render controlsSnippet(controls)}
{:else}
  {@render controls()}
{/if}

<style lang="scss">
  .hidden {
    display: none;
  }
  .controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .image-preview {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    padding: 8px 12px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
    img {
      width: 56px;
      height: 56px;
      object-fit: cover;
      border-radius: 8px;
    }
    .info {
      display: flex;
      flex-direction: column;
      .label {
        font-size: 0.8rem;
        color: var(--accent-color);
      }
      .name {
        font-size: 0.8rem;
        color: var(--text-muted);
      }
    }
    .close-btn {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
    }
  }
</style>
