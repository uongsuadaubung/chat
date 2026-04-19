<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import type { ChatMessage } from '$lib/type';

  interface Props {
    message: ChatMessage;
    timeStr: string;
  }
  let { message, timeStr }: Props = $props();

  const isPinEvent = $derived((message.systemEvent || '').toLowerCase().includes('pin'));
</script>

<div class="system-message" id="msg-{message.id}">
  <span class="system-text">
    <span class="system-name">{message.senderName}</span>
    {i18n.t(message.systemEvent || '')}
    {#if isPinEvent}
      "{message.text}"
    {/if}
    <span class="system-time">• {timeStr}</span>
  </span>
</div>

<style lang="scss">
  .system-message {
    display: flex;
    justify-content: center;
    margin: 8px 0;
    width: 100%;

    .system-text {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 0.8rem;
      color: var(--text-muted);
      backdrop-filter: var(--glass-blur);
      box-shadow: 0 2px 8px rgba(var(--color-black-rgb), 0.05);

      .system-name {
        font-weight: 600;
        color: var(--text-main);
      }

      .system-time {
        font-size: 0.7rem;
        opacity: 0.7;
        margin-left: 4px;
      }
    }
  }
</style>
