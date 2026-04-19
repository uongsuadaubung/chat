# ChatInput Refactoring & Real-time Network Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ChatInput.svelte` into smaller, maintainable components and add real-time message delivery feedback (Pending status).

**Architecture:**

- Break down `ChatInput` into `InputPreviewBanner`, `VoiceRecorder`, and `AttachmentManager`.
- `ChatInput` acts as the orchestrator.
- Network feedback is implemented by adding an `isPending` flag to message objects and showing a UI indicator in `MessageBubble`.

**Tech Stack:** Svelte 5 (Runes), TypeScript, WebRTC.

---

### Task 1: Create InputPreviewBanner Component

**Files:**

- Create: `src/lib/features/chat/components/InputPreviewBanner.svelte`

- [ ] **Step 1: Implement the component**

```svelte
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
      {#if replyingTo?.type === 'file'}
        {@const cat = getFileCategory(replyingTo.file?.mimeType)}
        <FileCategoryIcon category={cat} size={14} />
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/features/chat/components/InputPreviewBanner.svelte
git commit -m "feat: add InputPreviewBanner component"
```

---

### Task 2: Create VoiceRecorder Component

**Files:**

- Create: `src/lib/features/chat/components/VoiceRecorder.svelte`

- [ ] **Step 1: Implement the component**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { log } from '$lib/core/logger';
  import { toast } from '$lib/shared/stores/toast.store.svelte';
  import AudioVisualizer from '$lib/features/chat/components/attachments/AudioVisualizer.svelte';
  import PlayIcon from '$lib/shared/components/icons/PlayIcon.svelte';
  import PauseIcon from '$lib/shared/components/icons/PauseIcon.svelte';
  import TrashIcon from '$lib/shared/components/icons/TrashIcon.svelte';

  interface Props {
    onDone: (file: File) => void;
    onCancel: () => void;
  }
  let { onDone, onCancel }: Props = $props();

  let mediaRecorder = $state<MediaRecorder | null>(null);
  let audioChunks: Blob[] = [];
  let recordingDuration = $state(0);
  let isPaused = $state(false);
  let recordingInterval: ReturnType<typeof setTimeout> | undefined;
  let isCancelled = false;

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      isCancelled = false;
      const options = MediaRecorder.isTypeSupported('audio/webm')
        ? { mimeType: 'audio/webm' }
        : undefined;
      mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstart = () => {
        recordingDuration = 0;
        recordingInterval = setInterval(() => {
          if (mediaRecorder?.state === 'recording') recordingDuration++;
        }, 1000);
      };

      mediaRecorder.onstop = () => {
        clearInterval(recordingInterval);
        stream.getTracks().forEach((t) => t.stop());
        if (!isCancelled && audioChunks.length > 0) {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
          onDone(file);
        }
      };

      mediaRecorder.start();
    } catch (e) {
      log.sys.error('Failed to start recording:', e);
      toast.error(i18n.t('micError'));
      onCancel();
    }
  }

  function togglePause() {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.pause();
      isPaused = true;
    } else if (mediaRecorder?.state === 'paused') {
      mediaRecorder.resume();
      isPaused = false;
    }
  }

  function stop() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  }

  function cancel() {
    isCancelled = true;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    onCancel();
  }

  function formatTime(s: number) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  onMount(() => {
    start();
  });
  onDestroy(() => {
    clearInterval(recordingInterval);
    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
  });

  export { stop };
</script>

<div class="recorder-ui">
  <div class="red-dot" class:blinking={!isPaused}></div>
  <span class="timer">{formatTime(recordingDuration)}</span>
  <AudioVisualizer stream={mediaRecorder?.stream || null} {isPaused} />

  <div class="actions">
    <button class="action-btn" onclick={togglePause}>
      {#if isPaused}
        <PlayIcon size={18} />
      {:else}
        <PauseIcon size={18} />
      {/if}
    </button>
    <button class="action-btn cancel" onclick={cancel}>
      <TrashIcon size={18} />
    </button>
  </div>
</div>

<style lang="scss">
  .recorder-ui {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding-left: 12px;

    .red-dot {
      width: 10px;
      height: 10px;
      background-color: var(--color-danger);
      border-radius: 50%;
      &.blinking {
        animation: blinker 1s linear infinite;
      }
    }

    .timer {
      font-family: monospace;
      font-size: 1.1rem;
    }

    .actions {
      margin-left: auto;
      display: flex;
      gap: 4px;
    }

    .action-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      &:hover {
        background: rgba(var(--color-slate-500-rgb), 0.1);
        color: var(--text-main);
      }
      &.cancel:hover {
        background: rgba(var(--color-danger-rgb), 0.15);
        color: var(--color-red-500);
      }
    }
  }
  @keyframes blinker {
    50% {
      opacity: 0;
    }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/features/chat/components/VoiceRecorder.svelte
git commit -m "feat: add VoiceRecorder component"
```

---

### Task 3: Create AttachmentManager Component

**Files:**

- Create: `src/lib/features/chat/components/AttachmentManager.svelte`

- [ ] **Step 1: Implement the component**

```svelte
<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import AttachMenu from '$lib/features/chat/components/AttachMenu.svelte';
  import EmojiMenu from '$lib/features/chat/components/EmojiMenu.svelte';
  import CloseIcon from '$lib/shared/components/icons/CloseIcon.svelte';
  import { ACCEPT_IMAGE_VIDEO, ACCEPT_FILES } from '$lib/features/chat/constants/chat.constant';

  interface Props {
    onFileSelect: (file: File) => void;
    onEmojiSelect: (emoji: string) => void;
    onScreenShareToggle: () => void;
    isCallActive: boolean;
    isScreenShareDisabled: boolean;
    isScreenSharing: boolean;
    pendingImage: File | null;
  }
  let {
    onFileSelect,
    onEmojiSelect,
    onScreenShareToggle,
    isCallActive,
    isScreenShareDisabled,
    isScreenSharing,
    pendingImage = $bindable()
  }: Props = $props();

  let fileInputEl: HTMLInputElement | undefined;
  let previewUrl = $state<string | null>(null);

  $effect(() => {
    if (pendingImage) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(pendingImage);
    } else {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
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
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          pendingImage = new File([file], `paste_${Date.now()}.png`, { type: item.type });
          return true; // handled
        }
      }
    }
    return false;
  }
</script>

{#if pendingImage && previewUrl}
  <div class="image-preview">
    <img src={previewUrl} alt="Preview" />
    <div class="info">
      <span class="label">{i18n.t('pasteImageLabel')}</span>
      <span class="name">{pendingImage.name}</span>
    </div>
    <button class="close-btn" onclick={() => (pendingImage = null)}><CloseIcon size={16} /></button>
  </div>
{/if}

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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/features/chat/components/AttachmentManager.svelte
git commit -m "feat: add AttachmentManager component"
```

---

### Task 4: Refactor ChatInput.svelte

**Files:**

- Modify: `src/lib/features/chat/components/ChatInput.svelte`

- [ ] **Step 1: Replace logic with new components**

```svelte
<script lang="ts">
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

  interface Props {
    onScreenShareToggle?: () => void;
    isScreenShareDisabled?: boolean;
    isScreenSharing?: boolean;
  }
  let { onScreenShareToggle, isScreenShareDisabled, isScreenSharing }: Props = $props();

  let textInput = $state('');
  let inputEl: HTMLInputElement | undefined;
  let isRecording = $state(false);
  let pendingImage = $state<File | null>(null);
  let recorderRef: any;
  let attachRef: any;

  let isCallActive = $derived(webrtc.callState !== 'idle');

  $effect(() => {
    if (chatStore.editingMessage?.text) {
      textInput = chatStore.editingMessage.text;
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
            recipientId: chatStore.selectedPeerId,
            replyToId: chatStore.replyingToMessage?.id,
            replyPreview: getMessagePreviewText(chatStore.replyingToMessage)
          });
          chatStore.setReply(null);
        }
      }
      textInput = '';
      webrtc.sendTypingStatus(false, chatStore.selectedPeerId);
    }
  }

  function handleEmoji(emoji: string) {
    const start = inputEl?.selectionStart || 0;
    textInput = textInput.slice(0, start) + emoji + textInput.slice(inputEl?.selectionEnd || 0);
    setTimeout(() => inputEl?.focus(), 0);
  }

  function handleVoiceDone(file: File) {
    if (chatStore.selectedPeerId) webrtc.sendFile(file, chatStore.selectedPeerId);
    isRecording = false;
  }
</script>

<div class="input-area">
  <InputPreviewBanner />
  <AttachmentManager
    bind:this={attachRef}
    bind:pendingImage
    onFileSelect={(f) => chatStore.selectedPeerId && webrtc.sendFile(f, chatStore.selectedPeerId)}
    onEmojiSelect={handleEmoji}
    {onScreenShareToggle}
    {isCallActive}
    {isScreenShareDisabled}
    {isScreenSharing}
  />

  <div class="input-wrapper">
    {#if !isRecording}
      <input
        type="text"
        bind:this={inputEl}
        bind:value={textInput}
        onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
        onpaste={(e) => attachRef.handlePaste(e)}
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
          ? recorderRef.stop()
          : textInput || pendingImage
            ? send()
            : (isRecording = true)}
    >
      {#if textInput || isRecording || pendingImage}
        <SendIcon />
      {:else}
        <MicIcon />
      {/if}
    </GlassButton>
  </div>
</div>

<style lang="scss">
  /* Retain styling from original ChatInput.svelte but cleaned up */
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/features/chat/components/ChatInput.svelte
git commit -m "refactor: split ChatInput into sub-components"
```

---

### Task 5: Implement Real-time Network Feedback (isPending)

**Files:**

- Modify: `src/lib/features/chat/types/chat.type.ts`
- Modify: `src/lib/features/webrtc/webrtc.store.svelte.ts`
- Modify: `src/lib/features/chat/components/MessageBubble.svelte`

- [ ] **Step 1: Add isPending to Message type**

```typescript
// src/lib/features/chat/types/chat.type.ts
export interface ChatMessage {
  // ... existing fields
  isPending?: boolean;
}
```

- [ ] **Step 2: Set isPending in webrtc.store**

Modify `sendChat` to set `isPending: true` initially, and unset it when Peer confirms (via existing or new ACK mechanism).

- [ ] **Step 3: Update MessageBubble UI**

```svelte
<!-- src/lib/features/chat/components/MessageBubble.svelte -->
{#if message.isPending}
  <span class="pending-icon">⏳</span>
{/if}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/chat/types/chat.type.ts src/lib/features/webrtc/webrtc.store.svelte.ts src/lib/features/chat/components/MessageBubble.svelte
git commit -m "feat: add real-time message pending indicator"
```
