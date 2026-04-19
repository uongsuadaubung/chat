<script lang="ts">
  import { untrack, tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import MessageBubble from '$lib/features/chat/components/MessageBubble.svelte';
  import LoaderIcon from '$lib/shared/components/icons/LoaderIcon.svelte';
  import ArrowDownIcon from '$lib/shared/components/icons/ArrowDownIcon.svelte';
  import {
    SCROLL_LOAD_THRESHOLD_PX,
    SCROLL_BOTTOM_THRESHOLD_PX,
    HISTORY_LOAD_COOLDOWN_MS
  } from '$lib/features/chat/constants/chat.constant';
  import { webrtc } from '$lib/features/webrtc/webrtc.store.svelte';
  import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import { chatStore } from '$lib/features/chat/stores/chat.store.svelte';

  let filteredMessages = $derived(
    chatStore.selectedPeerId
      ? (webrtc.messages[chatStore.selectedPeerId] || []).filter((m) => {
          const myId = ctx.currentUser?.id;
          return !myId || !m.hiddenFromPeers?.includes(myId);
        })
      : []
  );

  let messageMap = $derived.by(() => {
    const map = new SvelteMap<string, (typeof filteredMessages)[number]>();
    for (let i = 0; i < filteredMessages.length; i++) {
      const m = filteredMessages[i];
      map.set(m.id, m);
    }
    return map;
  });

  let container: HTMLDivElement | undefined = $state();
  let isAtBottom = $state(true); // Lưu trạng thái xem người dùng có đang xem ở cuối hay không
  let isLoadingOlder = $state(false); // Cooldown tải lịch sử
  let hasReachedTop = $state<Record<string, boolean>>({}); // Ngăn gọi liên tục khi đã cuộn hết lịch sử

  $effect(() => {
    if (!chatStore.selectedPeerId) return;
    const peerMsgs = webrtc.messages[chatStore.selectedPeerId] || [];
    const hasUnread = peerMsgs.some((m) => !m.isSelf && !m.read);
    if (chatStore.selectedPeerId && hasUnread) {
      untrack(() => {
        webrtc.markAsRead(chatStore.selectedPeerId!);
      });
    }
  });

  async function handleScroll() {
    if (!container) return;

    // Tránh nhảy sự kiện nếu nội dung nằm gọn trong màn hình
    if (container.scrollHeight <= container.clientHeight) {
      isAtBottom = true;
      return;
    }

    const peerId = chatStore.selectedPeerId;
    if (!peerId) return;

    // Tính toán khoảng cách đến đáy
    const distanceToBottom =
      container.scrollHeight - (container.scrollTop + container.clientHeight);
    const currentlyAtBottom = distanceToBottom <= SCROLL_BOTTOM_THRESHOLD_PX;

    // Luôn cập nhật isAtBottom ngay lập tức để Effect cuộn xuống cuối không bị lag
    isAtBottom = currentlyAtBottom;

    // Kích hoạt Reset về cuối nếu user đang xem quá khứ mà cuộn kịch sàn
    if (currentlyAtBottom && webrtc.viewingHistoryForRoom[peerId]) {
      webrtc.resetToPresent(peerId);
      hasReachedTop[peerId] = false; // Bỏ đánh dấu kịch trần vì ta vừa hủy xem lịch sử
      return;
    }

    // Lăn lên trên viền: Tải thêm quá khứ
    // Lưu ý: Tuyệt đối chặn không load cũ nếu như màn hình đang quá ngắn (ngắn đến mức chạm đáy)
    if (
      container.scrollTop < SCROLL_LOAD_THRESHOLD_PX &&
      !isLoadingOlder &&
      !hasReachedTop[peerId] &&
      !currentlyAtBottom
    ) {
      isLoadingOlder = true;
      const prevHeight = container.scrollHeight;

      try {
        const loadedCount = await webrtc.loadOlderMessages(peerId);

        if (loadedCount > 0) {
          await tick();
          // Bù trừ độ dài mảng mới nhét vào đầu để Scroll không bị nhảy
          container.scrollTop = container.scrollHeight - prevHeight;
        } else {
          hasReachedTop[peerId] = true;
        }
      } catch (e) {
        // Ngăn vòng lặp vô hạn nếu DB lỗi
        hasReachedTop[peerId] = true;
        throw e;
      } finally {
        setTimeout(() => {
          isLoadingOlder = false;
        }, HISTORY_LOAD_COOLDOWN_MS); // cooldown giãn cách request
      }
    }
  }

  // Theo dõi messages, dùng setTimeout để đảm bảo DOM layout đã được tính toán xong
  $effect(() => {
    if (chatStore.selectedPeerId && (webrtc.messages[chatStore.selectedPeerId] || []).length) {
      // Chỉ tự động cuộn nếu đang ở cuối tin nhắn.
      // Dùng untrack cho isAtBottom để effect KHÔNG re-run khi isAtBottom thay đổi
      // (chỉ re-run khi messages mới được thêm), tránh scroll-to-bottom không mong muốn khi spinner xuất hiện.
      let timer: ReturnType<typeof setTimeout>;
      if (untrack(() => isAtBottom)) {
        timer = setTimeout(() => {
          container?.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        }, 50);
      }
      return () => clearTimeout(timer);
    }
  });

  // Handle auto-scroll to message triggered by sidebar
  $effect(() => {
    if (chatStore.scrollToMessageId) {
      const msgId = chatStore.scrollToMessageId;
      // Delay slightly to ensure component might be rendered if we just loaded history
      setTimeout(async () => {
        let el = document.getElementById(`msg-${msgId}`);
        if (!el && chatStore.selectedPeerId) {
          const found = await webrtc.loadHistoryAroundMessage(msgId, chatStore.selectedPeerId);
          if (found) {
            hasReachedTop[chatStore.selectedPeerId] = false;
            await tick();
            el = document.getElementById(`msg-${msgId}`);
          }
        }

        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight-reply');
          setTimeout(() => el.classList.remove('highlight-reply'), 2000);
        }

        // reset the trigger
        untrack(() => {
          chatStore.scrollToMessageId = null;
        });
      }, 50);
    }
  });
  let isViewingHistory = $derived(
    chatStore.selectedPeerId && webrtc.viewingHistoryForRoom[chatStore.selectedPeerId]
  );
</script>

<div class="messages" bind:this={container} onscroll={handleScroll}>
  {#if isLoadingOlder}
    <div class="loader-wrapper">
      <LoaderIcon size="20" class="spin" />
    </div>
  {/if}

  {#each filteredMessages as message, i (message.id)}
    {@const prev = filteredMessages[i - 1]}
    {@const next = filteredMessages[i + 1]}
    {@const isFirstInGroup = !prev || prev.senderId !== message.senderId}
    {@const isLastInGroup = !next || next.senderId !== message.senderId}
    {@const repliedToMessage = message.replyToId
      ? (messageMap.get(message.replyToId) ?? null)
      : null}
    {@const isReplyDeleted = repliedToMessage?.isDeleted ?? false}
    <MessageBubble
      {message}
      {isFirstInGroup}
      {isLastInGroup}
      {isReplyDeleted}
      {repliedToMessage}
      onDelete={(msg) =>
        chatStore.selectedPeerId && webrtc.deleteMessage(msg.id, chatStore.selectedPeerId, false)}
      onUnsend={(msg) =>
        chatStore.selectedPeerId && webrtc.deleteMessage(msg.id, chatStore.selectedPeerId, true)}
      onReactClick={(msg, emoji) => {
        if (chatStore.selectedPeerId) webrtc.reactMessage(msg.id, emoji, chatStore.selectedPeerId);
      }}
      onPinClick={(msg) => {
        if (chatStore.selectedPeerId)
          webrtc.pinMessage(msg.id, !msg.isPinned, chatStore.selectedPeerId);
      }}
      onReplyClick={async (replyToId) => {
        let el = document.getElementById(`msg-${replyToId}`);
        if (!el && chatStore.selectedPeerId) {
          // Time Travel: Load mảng lịch sử trượt
          const found = await webrtc.loadHistoryAroundMessage(replyToId, chatStore.selectedPeerId);
          if (found) {
            hasReachedTop[chatStore.selectedPeerId] = false;
            // Chờ Svelte đính các DOM node mới từ list vừa load lên màn hình
            await tick();
            el = document.getElementById(`msg-${replyToId}`);
          }
        }

        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight-reply');
          setTimeout(() => el.classList.remove('highlight-reply'), 1000);
        }
      }}
    />
  {/each}
  {#if isViewingHistory}
    <button
      class="jump-to-present glass-button"
      onclick={() => {
        if (chatStore.selectedPeerId) {
          webrtc.resetToPresent(chatStore.selectedPeerId);
          hasReachedTop[chatStore.selectedPeerId] = false;
          container?.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        }
      }}
    >
      <ArrowDownIcon size="16" />
      {i18n.t('backToPresent')}
    </button>
  {/if}
</div>

<style lang="scss">
  .messages {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    scroll-behavior: smooth;

    :global(.message-outer-wrapper.highlight-reply .bubble) {
      box-shadow:
        0 0 0 3px rgba(var(--color-indigo-500-rgb), 0.6),
        var(--glass-shadow) !important;
      transform: scale(1.02);
    }

    .loader-wrapper {
      display: flex;
      justify-content: center;
      padding: 10px 0;
      opacity: 0.7;
      color: var(--color-primary);

      :global(.spin) {
        animation: spin 1s linear infinite;
      }
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

  .jump-to-present {
    position: sticky;
    bottom: 20px;
    align-self: center;
    margin-top: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0.6rem 1.2rem;
    border-radius: 20px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--text-color);
    font-size: 0.85rem;
    font-weight: 500;
    box-shadow: var(--glass-shadow);
    cursor: pointer;
    z-index: 50;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(var(--color-primary-rgb), 0.2);
      transform: translateY(-2px);
    }
  }
</style>
