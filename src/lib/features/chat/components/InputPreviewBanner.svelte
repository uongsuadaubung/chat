<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { getFileCategory } from '$lib/features/chat/util';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import EditIcon from '$lib/shared/components/icons/EditIcon.svelte';
  import ReplyIcon from '$lib/shared/components/icons/ReplyIcon.svelte';
  import FileCategoryIcon from '$lib/shared/components/FileCategoryIcon.svelte';

  let replyingTo = $derived(chatStore.replyingToMessage);
  let editing = $derived(chatStore.editingMessage);

  function handleCancel() {
    if (replyingTo) chatStore.setReply(null);
    if (editing) chatStore.setEdit(null);
  }
</script>

{#if replyingTo || editing}
  <div class="preview-banner">
    <div class="header">
      {#if replyingTo}
        <ReplyIcon size={14} />
        <span>{i18n.t('reply')} <b>{replyingTo.senderName}</b></span>
      {:else}
        <EditIcon size={14} />
        <span>{i18n.t('editMessage')}</span>
      {/if}
    </div>
    <div class="content">
      {#if replyingTo?.type === 'file' || editing?.type === 'file'}
        {@const msg = replyingTo || editing}
        {@const cat = getFileCategory(msg?.file?.mimeType)}
        <div class="file-preview-content">
          <FileCategoryIcon category={cat} size={14} />
          {#if msg?.text}
            <span class="caption-preview">{msg.text}</span>
          {/if}
        </div>
      {:else}
        {replyingTo?.text || editing?.text}
      {/if}
    </div>
    <button class="close-btn" onclick={handleCancel} aria-label="Cancel">
      <CloseIcon size={16} />
    </button>
  </div>
{/if}

<style lang="scss">
  .preview-banner {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    backdrop-filter: var(--glass-blur);
    border-radius: 12px;
    padding: 8px 12px;
    margin-bottom: 8px;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;

    .header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: var(--accent-color);
      font-weight: 500;
    }

    .content {
      font-size: 0.85rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-right: 24px;

      .file-preview-content {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;

        .caption-preview {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    }

    .close-btn {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        background: rgba(var(--color-gray-500-rgb), 0.2);
        color: var(--text-main);
      }
    }
  }
</style>
