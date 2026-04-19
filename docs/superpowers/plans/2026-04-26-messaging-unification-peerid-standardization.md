# PeerId Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Task 3 and Task 4 of the Messaging Unification plan by standardizing on `peerId` in `messageChannel.ts` and `dataChannel.ts`.

**Architecture:** Rename all `roomId` and `recipientId` variables/parameters to `peerId` in the message and data channel layers. Ensure all handlers use the incoming `payload.peerId` directly.

**Tech Stack:** Svelte 5 (Runes), TypeScript, Vitest.

---

### Task 1: Refactor `messageChannel.ts` (Remaining Task 3)

**Files:**

- Modify: `src/lib/features/webrtc/dataChannels/messageChannel.ts`
- Test: `src/lib/features/webrtc/dataChannels/messageChannel.test.ts`

- [ ] **Step 1: Update Tests in `messageChannel.test.ts`**
      Update tests to use `peerId` instead of `roomId` where applicable, and rename `recipientId` to `peerId` in test message objects.

```typescript
// Example update
const batch: ChatMessage[] = [
  {
    id: 'msg_1',
    senderId: 'peer_1',
    senderName: 'Peer',
    peerId: 'me_123', // changed from recipientId
    timestamp: 100,
    isSelf: false,
    type: 'text',
    text: 'Hi from Peer'
  }
  // ...
];
```

- [ ] **Step 2: Rename `getRoomId` to `getPeerId` in `messageChannel.ts`**
      Refactor the logic to use `msg.peerId` if available, or fallback to senderId/recipientId logic if needed (though `peerId` should be standard now).

```typescript
function getPeerId(msg: ChatMessage): string {
  if (msg.peerId) return msg.peerId;

  if (msg.isSelf) {
    if (!msg.recipientId) throw new Error('Tin nhắn gửi đi thiếu recipientId');
    return msg.recipientId;
  }
  if (!msg.senderId) throw new Error('Tin nhắn nhận được thiếu senderId');
  return msg.senderId;
}
```

- [ ] **Step 3: Rename `roomId` parameters to `peerId` in all exported functions**
      Functions: `addMessage`, `loadHistoryAroundMessage`, `loadOlderMessages`, `resetToPresent`, `editMessage`, `sendReadReceipt`, `sendReadReceiptBatch`, `pinMessage`, `deleteMessage`, `reactMessage`.

- [ ] **Step 4: Update `sendChat` and `sendTyping`**
      Rename `recipientId` to `peerId` in parameters and implementation.

- [ ] **Step 5: Update `fileIndex` and batch logic**
      Ensure `fileIndex` stores `peerId` and `addMessagesBatch` uses `getPeerId`.

- [ ] **Step 6: Run tests to verify `messageChannel.test.ts` passes**
      Run: `npx vitest src/lib/features/webrtc/dataChannels/messageChannel.test.ts`

- [ ] **Step 7: Commit Task 3 changes**

```bash
git add src/lib/features/webrtc/dataChannels/messageChannel.ts src/lib/features/webrtc/dataChannels/messageChannel.test.ts
git commit -m "refactor: standardize peerId usage in messageChannel"
```

---

### Task 2: Refactor Data Channel Handlers (Task 4)

**Files:**

- Modify: `src/lib/features/webrtc/dataChannel.ts`
- Test: `src/lib/features/webrtc/dataChannel.handler.test.ts`

- [ ] **Step 1: Update Tests in `dataChannel.handler.test.ts`**
      Standardize `makeTextMsg` and test cases to use `peerId`.

- [ ] **Step 2: Standardize `handle...Payload` functions in `dataChannel.ts`**
      Update `handleMessageRead`, `handleMessageReadBatch`, `handleMessageReact`, `handleMessageHideLocal`, `handleMessageDelete`, `handleMessageEdit`, `handleMessagePin`.
      Use `payload.peerId` directly and remove "targetRoomId" guessing logic.

```typescript
// Example refactor
export function handleMessageReact(
  peerId: string,
  payload: Extract<DataChannelPayload, { type: 'message_react' }>
) {
  const m = ctx.messages;
  const targetPeerId = payload.peerId; // Directly use payload.peerId
  const roomMsgs = m[targetPeerId];
  // ...
}
```

- [ ] **Step 3: Update `handleChatPayload` and `handleTypingPayload`**
      Ensure they use the new naming convention and logic. For `handleChatPayload`, if `msg.peerId` is not the current user's ID, it should be the correct ID already. If it's the current user's ID, we should probably set `msg.peerId = peerId` (the sender).

- [ ] **Step 4: Run tests to verify `dataChannel.handler.test.ts` passes**
      Run: `npx vitest src/lib/features/webrtc/dataChannel.handler.test.ts`

- [ ] **Step 5: Run all related tests**
      Run: `npx vitest src/lib/features/webrtc/dataChannels/ src/lib/features/webrtc/dataChannel.ts`

- [ ] **Step 6: Final Commit**

```bash
git add src/lib/features/webrtc/dataChannel.ts src/lib/features/webrtc/dataChannel.handler.test.ts
git commit -m "refactor: standardize peerId usage in data channel handlers"
```
