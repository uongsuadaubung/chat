<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';

  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';

  // now chỉ cần cập nhật khi có người đang gõ — dùng dynamic setTimeout thay setInterval
  let now = $state(Date.now());
  let tickTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleTick() {
    tickTimer = setTimeout(() => {
      now = Date.now();
      // Chỉ tiếp tục nếu vẫn còn ai đang gõ
      if (webrtc.typingUsers.size > 0) scheduleTick();
      else tickTimer = undefined;
    }, 1000);
  }

  // Theo dõi typingStore — chỉ khởi động timer khi có người gõ
  $effect(() => {
    const hasTyping = webrtc.typingUsers.size > 0;
    if (hasTyping && tickTimer === undefined) {
      scheduleTick();
    }
  });

  onDestroy(() => {
    if (tickTimer !== undefined) clearTimeout(tickTimer);
  });

  let typingNames = $derived.by(() => {
    const currentPeers = webrtc.peer;
    const activeIds = new SvelteSet<string>();
    const currentTime = now; // force dependency

    for (const [id, timestamp] of webrtc.typingUsers.entries()) {
      if (id === chatStore.selectedPeerId && currentTime - timestamp < 5000) {
        activeIds.add(id);
      }
    }

    return currentPeers.filter((p) => activeIds.has(p.id)).map((p) => p.name);
  });

  let displayText = $derived.by(() => {
    if (typingNames.length === 0) return '';
    if (typingNames.length === 1) return `${typingNames[0]} ${i18n.t('isTyping')}`;
    if (typingNames.length === 2)
      return `${typingNames[0]}, ${typingNames[1]} ${i18n.t('areTyping')}`;
    if (typingNames.length === 3)
      return `${typingNames[0]}, ${typingNames[1]}, ${typingNames[2]} ${i18n.t('areTyping')}`;
    return `${typingNames[0]}, ${typingNames[1]}, ${typingNames[2]},... ${i18n.t('areTyping')}`;
  });
</script>

{#if typingNames.length > 0}
  <div class="typing-indicator">
    <div class="dots-wrapper">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <span class="text">{displayText}</span>
  </div>
{/if}

<style lang="scss">
  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 24px 16px 24px;
    opacity: 0.8;
    font-size: 0.85rem;
    color: var(--text-muted);
    animation: fadeIn 0.3s ease;
  }

  .dots-wrapper {
    display: flex;
    gap: 4px;
    align-items: center;
    background: var(--input-bg);
    padding: 10px 14px;
    border-radius: 18px;
  }

  .dot {
    width: 6px;
    height: 6px;
    background-color: var(--text-muted);
    border-radius: 50%;
    animation: bounce 1s infinite ease-in-out;

    &:nth-child(1) {
      animation-delay: 0s;
    }
    &:nth-child(2) {
      animation-delay: 0.2s;
    }
    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }

  @keyframes bounce {
    0%,
    100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    50% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 0.8;
      transform: translateY(0);
    }
  }

  .text {
    font-style: italic;
  }
</style>
