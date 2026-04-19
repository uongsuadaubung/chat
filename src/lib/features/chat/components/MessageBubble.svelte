<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import type { ChatMessage } from '$lib/type';
  import ImageAttachment from '$lib/features/chat/components/attachments/ImageAttachment.svelte';
  import VideoAttachment from '$lib/features/chat/components/attachments/VideoAttachment.svelte';
  import AudioAttachment from '$lib/features/chat/components/attachments/AudioAttachment.svelte';
  import FileAttachment from '$lib/features/chat/components/attachments/FileAttachment.svelte';
  import MessageActions from '$lib/features/chat/components/MessageActions.svelte';
  import SystemMessageBubble from '$lib/features/chat/components/SystemMessageBubble.svelte';
  import FileCategoryIcon from '$lib/shared/components/FileCategoryIcon.svelte';
  import { getFileCategory } from '$lib/features/chat/util';

  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { uiState } from '$lib/shared/stores/ui.store.svelte';
  import UserAvatar from '$lib/shared/components/UserAvatar.svelte';
  import LoaderIcon from '$lib/shared/components/icons/LoaderIcon.svelte';

  interface Props {
    message: ChatMessage;
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
    isReplyDeleted?: boolean;
    repliedToMessage?: ChatMessage | null;
    onDelete?: (msg: ChatMessage) => void;
    onUnsend?: (msg: ChatMessage) => void;
    onReactClick?: (msg: ChatMessage, emoji: string) => void;
    onReplyClick?: (replyToId: string) => void;
    onPinClick?: (msg: ChatMessage) => void;
  }
  let {
    message,
    isFirstInGroup = true,
    isLastInGroup = true,
    isReplyDeleted = false,
    repliedToMessage = null,
    onDelete,
    onUnsend,
    onReactClick,
    onReplyClick,
    onPinClick
  }: Props = $props();

  const timeStr = $derived(
    new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  let hasReactions = $derived(!!message.reactions && Object.keys(message.reactions).length > 0);

  let isImageOrVideoBubble = $derived(
    message.type === 'file' &&
      (getFileCategory(message.file?.mimeType) === 'image' ||
        getFileCategory(message.file?.mimeType) === 'video') &&
      !message.file?.isPendingDownload &&
      !message.file?.isReceiving &&
      !message.isDeleted
  );

  let isReadStatusVisible = $derived(message.isSelf && message.read && !message.isDeleted);
</script>

{#if message.type === 'system' && message.systemEvent}
  <SystemMessageBubble {message} {timeStr} />
{:else}
  <div
    id="msg-{message.id}"
    class="message-wrapper message-outer-wrapper"
    class:is-self={message.isSelf}
    class:is-first={isFirstInGroup}
    class:is-last={isLastInGroup}
    class:is-middle={!isFirstInGroup && !isLastInGroup}
    class:has-reactions={hasReactions}
  >
    {#if !message.isSelf && isFirstInGroup}
      <div class="sender-name">{message.senderName}</div>
    {/if}

    <div class="bubble-row">
      {#if message.isSelf && !message.isDeleted}
        <MessageActions
          {message}
          onEdit={() => chatStore.setEdit(message)}
          onUnsend={() => onUnsend?.(message)}
          onDelete={() => onDelete?.(message)}
          onReply={() => chatStore.setReply(message)}
          onReactClick={(emoji) => onReactClick?.(message, emoji)}
          onPin={() => onPinClick?.(message)}
        />
      {/if}

      {#if !message.isSelf}
        <div class="avatar-col">
          {#if isLastInGroup}
            <UserAvatar name={message.senderName} userId={message.senderId} size={32} />
          {/if}
        </div>
      {/if}

      <div
        class="bubble"
        class:image-bubble={isImageOrVideoBubble}
        class:is-deleted={message.isDeleted}
      >
        {#if message.replyPreview && !message.isDeleted}
          <div
            class="reply-preview"
            role="button"
            tabindex="0"
            onclick={() => {
              if (message.replyToId) onReplyClick?.(message.replyToId);
            }}
            onkeydown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && message.replyToId) {
                e.preventDefault();
                onReplyClick?.(message.replyToId);
              }
            }}
          >
            {#if isReplyDeleted}
              <i class="deleted-text">{i18n.t('messageUnsent')}</i>
            {:else if repliedToMessage && repliedToMessage.type === 'file'}
              {@const cat = getFileCategory(repliedToMessage.file?.mimeType)}
              <FileCategoryIcon category={cat} size={14} customLabel={message.replyPreview} />
            {:else}
              {message.replyPreview}
            {/if}
          </div>
        {/if}

        {#if message.isDeleted}
          <i class="deleted-text">{i18n.t('messageUnsent')}</i>
        {:else}
          {#if message.type === 'file' && message.file}
            {@const cat = getFileCategory(message.file.mimeType)}
            {#if cat === 'image'}
              <ImageAttachment
                {message}
                onPreview={(url) =>
                  (uiState.previewMedia = {
                    type: 'image',
                    url: url,
                    name: message.file?.name
                  })}
              />
            {:else if cat === 'video'}
              <VideoAttachment
                {message}
                onPreview={(url) =>
                  (uiState.previewMedia = {
                    type: 'video',
                    url: url,
                    name: message.file?.name
                  })}
              />
            {:else if cat === 'audio'}
              <AudioAttachment {message} />
            {:else}
              <FileAttachment {message} />
            {/if}
            {#if message.text}
              <p class="image-caption">{message.text}</p>
            {/if}
          {:else}
            {message.text}
            {#if message.isEdited}
              <span class="edited-mark">{i18n.t('edited')}</span>
            {/if}
          {/if}

          {#if hasReactions}
            <div class="reactions-box">
              {#each Object.entries(message.reactions || {}) as [userId, reaction] (userId)}
                <span class="reaction-item">{reaction}</span>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      {#if !message.isSelf && !message.isDeleted}
        <MessageActions
          {message}
          onReply={() => chatStore.setReply(message)}
          onDelete={() => onDelete?.(message)}
          onReactClick={(emoji) => onReactClick?.(message, emoji)}
          onPin={() => onPinClick?.(message)}
        />
      {/if}
    </div>

    {#if isLastInGroup}
      <div class="time">
        {timeStr}
        {#if message.isPending && message.isSelf}
          <span class="pending-icon" title={i18n.t('sending')}>
            <LoaderIcon size={12} />
          </span>
        {/if}
        {#if isReadStatusVisible}
          <span class="read-status"> • {i18n.t('seen')}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .message-wrapper {
    display: flex;
    flex-direction: column;
    max-width: 75%;
    align-self: flex-start;
    margin-bottom: 2px;

    @media (max-width: 768px) {
      max-width: 85%;
    }

    &.has-reactions {
      margin-bottom: 14px;
    }

    &.is-last {
      margin-bottom: 1rem;
    }

    &.has-reactions.is-last {
      margin-bottom: calc(1rem + 12px);
    }

    &.is-self {
      align-self: flex-end;
      align-items: flex-end;

      .bubble {
        background: var(--bubble-self);
        color: var(--bubble-self-text);
      }

      &.is-first.is-last .bubble {
        border-radius: 18px;
        border-bottom-right-radius: 4px;
      }
      &.is-first:not(.is-last) .bubble {
        border-radius: 18px;
        border-bottom-right-radius: 4px;
      }
      &.is-middle .bubble {
        border-radius: 18px;
        border-top-right-radius: 4px;
        border-bottom-right-radius: 4px;
      }
      &.is-last:not(.is-first) .bubble {
        border-radius: 18px;
        border-top-right-radius: 4px;
      }

      .sender-name {
        display: none;
      }

      /* Fix contrast on accent-colored bubble via :global because they are in child components now */
      :global(.file-icon) {
        background: rgba(var(--color-white-rgb), 0.2) !important;
      }
      :global(.file-size) {
        color: rgba(var(--color-white-rgb), 0.7) !important;
        opacity: 1 !important;
      }
      :global(.file-name) {
        color: var(--bubble-self-text);
      }
    }

    &:not(.is-self) {
      &.is-first.is-last .bubble {
        border-radius: 18px;
        border-bottom-left-radius: 4px;
      }
      &.is-first:not(.is-last) .bubble {
        border-radius: 18px;
        border-bottom-left-radius: 4px;
      }
      &.is-middle .bubble {
        border-radius: 18px;
        border-top-left-radius: 4px;
        border-bottom-left-radius: 4px;
      }
      &.is-last:not(.is-first) .bubble {
        border-radius: 18px;
        border-top-left-radius: 4px;
      }
    }
  }

  .bubble-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    position: relative;
  }

  .sender-name {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 2px;
    margin-left: 56px; /* Offset for avatar column (32px + 12px gap + some extra) */
    font-weight: 600;
  }

  .avatar-col {
    width: 32px;
    margin-right: 12px;
    display: flex;
    align-items: flex-end;
    flex-shrink: 0;
    min-height: 32px;
  }

  .bubble {
    background: var(--bubble-other);
    color: var(--bubble-other-text);
    padding: 8px 14px;
    border-radius: 18px;
    font-size: 0.95rem;
    word-break: break-word;
    line-height: 1.45;
    box-shadow: var(--glass-shadow);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    position: relative;

    &.is-deleted {
      background: transparent;
      border: 1px solid var(--glass-border);
      color: var(--text-muted);
      box-shadow: none;
      padding: 6px 12px;
    }

    .deleted-text {
      font-size: 0.85rem;
      opacity: 0.7;
    }

    .edited-mark {
      font-size: 0.7rem;
      opacity: 0.6;
      margin-left: 6px;
    }

    .reply-preview {
      font-size: 0.8rem;
      color: var(--text-muted);
      border-left: 2px solid var(--accent-color);
      padding-left: 6px;
      margin-bottom: 6px;
      opacity: 0.8;
      cursor: pointer;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;

      &:hover {
        opacity: 1;
        text-decoration: underline;
      }
    }

    .reactions-box {
      position: absolute;
      bottom: -10px;
      right: 12px;
      display: flex;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 2px 4px;
      font-size: 0.85rem;
      box-shadow: 0 2px 4px rgba(var(--color-black-rgb), 0.1);
      z-index: 10;
    }

    &.image-bubble {
      padding: 4px;
      background: transparent;
      border: none;
      box-shadow: none;
      margin-bottom: 8px; /* Room for reactions */

      .image-caption {
        padding: 0 6px;
      }

      &:has(.image-caption) {
        background: var(--bubble-other);
        color: var(--bubble-other-text);
        border: 1px solid var(--glass-border);
        box-shadow: var(--glass-shadow);

        :global(.is-self) & {
          background: var(--bubble-self);
          color: var(--bubble-self-text);
        }

        /* Apply proper border radius based on message position */
        :global(.is-self.is-first.is-last) & {
          border-radius: 18px;
          border-bottom-right-radius: 4px;
        }
        :global(.is-self.is-first:not(.is-last)) & {
          border-radius: 18px;
          border-bottom-right-radius: 4px;
        }
        :global(.is-self.is-middle) & {
          border-radius: 18px;
          border-top-right-radius: 4px;
          border-bottom-right-radius: 4px;
        }
        :global(.is-self.is-last:not(.is-first)) & {
          border-radius: 18px;
          border-top-right-radius: 4px;
        }

        :global(:not(.is-self).is-first.is-last) & {
          border-radius: 18px;
          border-bottom-left-radius: 4px;
        }
        :global(:not(.is-self).is-first:not(.is-last)) & {
          border-radius: 18px;
          border-bottom-left-radius: 4px;
        }
        :global(:not(.is-self).is-middle) & {
          border-radius: 18px;
          border-top-left-radius: 4px;
          border-bottom-left-radius: 4px;
        }
        :global(:not(.is-self).is-last:not(.is-first)) & {
          border-radius: 18px;
          border-top-left-radius: 4px;
        }
      }
    }

    .image-caption {
      font-size: 0.9rem;
      margin: 4px 2px 2px;
      line-height: 1.4;
      word-break: break-word;
    }
  }

  .time {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 4px;
    margin-right: 8px;
    margin-left: 56px; /* Offset to align with bubble content start */
    font-weight: 500;

    .is-self & {
      margin-left: 12px;
    }

    .pending-icon {
      margin-left: 4px;
      font-size: 0.75rem;
      opacity: 0.8;
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
      animation: spin 2s linear infinite;
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
