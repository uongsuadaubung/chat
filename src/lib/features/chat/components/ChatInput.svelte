<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';
  import SendIcon from '$lib/shared/components/icons/SendIcon.svelte';
  import MicIcon from '$lib/shared/components/icons/MicIcon.svelte';
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';
  import { getMessagePreviewText } from '$lib/features/chat/util';
  import { TYPING_TIMEOUT_MS } from '$lib/features/chat/constants/chat.constant';

  import InputPreviewBanner from './InputPreviewBanner.svelte';
  import VoiceRecorder from './VoiceRecorder.svelte';
  import AttachmentManager from './AttachmentManager.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    onScreenShareToggle?: () => void;
    isScreenShareDisabled?: boolean;
    isScreenSharing?: boolean;
  }
  let { onScreenShareToggle, isScreenShareDisabled, isScreenSharing }: Props = $props();

  let textInput = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  let isRecording = $state(false);
  let pendingImage = $state<File | null>(null);
  let recorderRef = $state<ReturnType<typeof VoiceRecorder>>();
  let attachRef = $state<ReturnType<typeof AttachmentManager>>();

  let isCallActive = $derived(webrtc.callState !== 'idle');

  // Typing status logic
  let typingTimeout: ReturnType<typeof setTimeout> | undefined;
  let isCurrentlyTyping = false;

  onMount(() => {
    inputEl?.focus();
  });

  onDestroy(() => {
    if (typingTimeout) clearTimeout(typingTimeout);
  });

  $effect(() => {
    if (chatStore.editingMessage?.text) {
      textInput = chatStore.editingMessage.text;
      inputEl?.focus();
    }
  });

  $effect(() => {
    if (chatStore.replyingToMessage) {
      inputEl?.focus();
    }
  });

  function send() {
    const text = textInput.trim();
    if (!text && !pendingImage) return;

    if (chatStore.selectedPeerId) {
      if (pendingImage) {
        webrtc.sendFile(pendingImage, chatStore.selectedPeerId, text || undefined);
        pendingImage = null;
      } else if (text) {
        if (chatStore.editingMessage) {
          webrtc.editMessage(chatStore.editingMessage.id, text, chatStore.selectedPeerId);
          chatStore.setEdit(null);
        } else {
          webrtc.sendChat({
            text,
            peerId: chatStore.selectedPeerId,
            replyToId: chatStore.replyingToMessage?.id,
            replyPreview: getMessagePreviewText(chatStore.replyingToMessage)
          });
          chatStore.setReply(null);
        }
      }

      textInput = '';
      if (isCurrentlyTyping) {
        isCurrentlyTyping = false;
        webrtc.sendTypingStatus(false, chatStore.selectedPeerId);
        if (typingTimeout) clearTimeout(typingTimeout);
      }
    }
    inputEl?.focus();
  }

  function handleInput() {
    if (!chatStore.selectedPeerId) return;

    if (!isCurrentlyTyping && textInput.length > 0) {
      isCurrentlyTyping = true;
      webrtc.sendTypingStatus(true, chatStore.selectedPeerId);
    } else if (isCurrentlyTyping && textInput.length === 0) {
      isCurrentlyTyping = false;
      webrtc.sendTypingStatus(false, chatStore.selectedPeerId);
      if (typingTimeout) clearTimeout(typingTimeout);
    }

    if (isCurrentlyTyping) {
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isCurrentlyTyping = false;
        if (chatStore.selectedPeerId) {
          webrtc.sendTypingStatus(false, chatStore.selectedPeerId);
        }
      }, TYPING_TIMEOUT_MS);

      if (Date.now() - Number(inputEl?.dataset.lastType || 0) > 2500) {
        webrtc.sendTypingStatus(true, chatStore.selectedPeerId);
        if (inputEl) inputEl.dataset.lastType = Date.now().toString();
      }
    }
  }

  function handleEmoji(emoji: string) {
    const start = inputEl?.selectionStart || 0;
    const end = inputEl?.selectionEnd || 0;
    textInput = textInput.slice(0, start) + emoji + textInput.slice(end);
    setTimeout(() => {
      inputEl?.focus();
      const pos = start + emoji.length;
      inputEl?.setSelectionRange(pos, pos);
      handleInput();
    }, 0);
  }

  function handleVoiceDone(file: File) {
    if (chatStore.selectedPeerId) webrtc.sendFile(file, chatStore.selectedPeerId);
    isRecording = false;
  }

  function handleBlur() {
    if (isCurrentlyTyping && chatStore.selectedPeerId) {
      isCurrentlyTyping = false;
      webrtc.sendTypingStatus(false, chatStore.selectedPeerId);
      if (typingTimeout) clearTimeout(typingTimeout);
    }
  }
</script>

<div class="input-area">
  <InputPreviewBanner />

  <AttachmentManager
    bind:this={attachRef}
    bind:pendingImage
    onFileSelect={(f) => chatStore.selectedPeerId && webrtc.sendFile(f, chatStore.selectedPeerId)}
    onEmojiSelect={handleEmoji}
    onScreenShareToggle={onScreenShareToggle || (() => {})}
    {isCallActive}
    isScreenShareDisabled={isScreenShareDisabled ?? false}
    isScreenSharing={isScreenSharing ?? false}
    previewSnippet={previewContainer}
    controlsSnippet={controlsContainer}
  />

  {#snippet previewContainer(p: Snippet)}
    {@render p()}
  {/snippet}

  {#snippet controlsContainer(c: Snippet)}
    <div class="input-wrapper">
      {#if !isRecording}
        {@render c()}
        <input
          type="text"
          bind:this={inputEl}
          bind:value={textInput}
          onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          oninput={handleInput}
          onblur={handleBlur}
          onpaste={(e) => {
            const handled = attachRef?.handlePaste(e);
            if (handled && chatStore.editingMessage) {
              chatStore.setEdit(null);
            }
          }}
          placeholder={i18n.t('chatPlaceholder')}
        />
      {:else}
        <VoiceRecorder
          bind:this={recorderRef}
          onDone={handleVoiceDone}
          onCancel={() => (isRecording = false)}
        />
      {/if}

      <GlassButton
        variant="circle"
        onclick={() =>
          isRecording
            ? recorderRef?.stop()
            : textInput.trim() || pendingImage
              ? send()
              : (isRecording = true)}
        ariaLabel={isRecording
          ? i18n.t('sendVoiceMessage')
          : textInput.trim() || pendingImage
            ? i18n.t('sendMessage')
            : i18n.t('recordVoice')}
      >
        {#if textInput.trim() || isRecording || pendingImage}
          <SendIcon />
        {:else}
          <MicIcon />
        {/if}
      </GlassButton>
    </div>
  {/snippet}
</div>

<style lang="scss">
  .input-area {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--glass-border);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);

    @media (max-width: 768px) {
      padding: 0.75rem 0.9rem;
    }

    .input-wrapper {
      display: flex;
      align-items: center;
      background: var(--input-bg);
      border-radius: 9999px;
      padding: 0.4rem 0.75rem 0.4rem 0.8rem;
      border: 1px solid var(--input-border);
      transition: all 0.2s;
      margin-top: 4px;
      gap: 6px;

      &:focus-within {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 4px rgba(var(--color-indigo-500-rgb), 0.1);
      }

      input[type='text'] {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        font-size: 1.05rem;
        padding: 0.5rem 0;
        color: var(--text-main);
        &:focus {
          outline: none;
        }
        &::placeholder {
          color: var(--text-muted);
        }
      }
    }
  }
</style>
