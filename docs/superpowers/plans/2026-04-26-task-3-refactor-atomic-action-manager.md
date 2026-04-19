# Messaging Unification - Task 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Atomic Action Manager and Message Channel to use `peerId` instead of `roomId`, aligning with the Messaging Unification plan for 1-1 chat architecture.

**Architecture:** We are moving away from `roomId` concept in 1-1 chats, using the peer's ID directly as the identifier for the conversation. This affects atomic actions, outbox, and message channel operations.

**Tech Stack:** TypeScript, Svelte 5 (ctx store), Dexie (IndexedDB), Vitest.

---

### Task 1: Refactor `atomicActionManager.ts`

**Files:**

- Modify: `src/lib/features/webrtc/atomicActionManager.ts`
- Test: `src/lib/features/webrtc/atomicActionManager.test.ts`

- [ ] **Step 1: Update `atomicActionManager.test.ts` to use `peerId` in actions**

Replace all occurrences of `roomId` with `peerId` in the test file.

```typescript
// Example change in src/lib/features/webrtc/atomicActionManager.test.ts
// From:
const action = { type: 'pin' as const, messageId: 'msg_123', roomId: 'peer_1', isPinned: true };
// To:
const action = { type: 'pin' as const, messageId: 'msg_123', peerId: 'peer_1', isPinned: true };
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest src/lib/features/webrtc/atomicActionManager.test.ts`
Expected: FAIL (Type errors or runtime errors due to missing `roomId`)

- [ ] **Step 3: Update `atomicActionManager.ts` to use `peerId`**

Update `applyDefaultOptimisticUpdate`, `saveToTransactionalOutbox`, `createNetworkPayload`, `buildUpdatedMessage`, `getMessageFromOriginalState`, `sendNetworkSignalWithTimeout`, `markOutboxCompleted`, `rollbackTransaction`, and `rollbackUIState`.

```typescript
// Example change in src/lib/features/webrtc/atomicActionManager.ts
// From:
const roomMsgs = m[action.roomId] || [];
// To:
const roomMsgs = m[action.peerId] || [];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest src/lib/features/webrtc/atomicActionManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/webrtc/atomicActionManager.ts src/lib/features/webrtc/atomicActionManager.test.ts
git commit -m "refactor: use peerId in atomicActionManager"
```

### Task 2: Refactor `transaction.util.ts`

**Files:**

- Modify: `src/lib/features/webrtc/transaction.util.ts`
- Test: `src/lib/features/webrtc/transaction.util.test.ts`

- [ ] **Step 1: Update `transaction.util.test.ts` to use `peerId`**

Replace all occurrences of `roomId` with `peerId` in the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest src/lib/features/webrtc/transaction.util.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `transaction.util.ts` to use `peerId`**

Update `captureOriginalState` to use `action.peerId`.

```typescript
// Example change in src/lib/features/webrtc/transaction.util.ts
// From:
const roomMsgs = ctx.messages[action.roomId] || [];
// To:
const roomMsgs = ctx.messages[action.peerId] || [];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest src/lib/features/webrtc/transaction.util.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/webrtc/transaction.util.ts src/lib/features/webrtc/transaction.util.test.ts
git commit -m "refactor: use peerId in transaction.util"
```

### Task 3: Refactor `messageChannel.ts`

**Files:**

- Modify: `src/lib/features/webrtc/dataChannels/messageChannel.ts`
- Test: `src/lib/features/webrtc/dataChannels/messageChannel.test.ts`, `src/lib/features/webrtc/dataChannels/messageChannel.pin.test.ts`, `src/lib/features/webrtc/dataChannels/messageChannel.transaction.test.ts`

- [ ] **Step 1: Update `messageChannel.ts` exported functions**

Rename `roomId` parameters to `peerId` in `sendMessage` (actually `sendChat`), `deleteMessage`, `editMessage`, `reactMessage`, `pinMessage`, `sendTyping`, `sendReadReceipt`, `sendReadReceiptBatch`, `loadHistoryAroundMessage`, `loadOlderMessages`, `resetToPresent`.
Update calls to `atomicActionManager.executeAtomicAction` to use `peerId`.

- [ ] **Step 2: Update `getRoomId` to `getPeerId` or simplify**

Check if `getRoomId` can be renamed to `getPeerId` and if it can be simplified since `peerId` is now in `ChatMessage` (likely as `recipientId` for self and `senderId` for others).

- [ ] **Step 3: Update related tests**

Update `messageChannel.test.ts`, `messageChannel.pin.test.ts`, `messageChannel.transaction.test.ts` to use `peerId`.

- [ ] **Step 4: Run all related tests**

Run: `npx vitest src/lib/features/webrtc/dataChannels/messageChannel*.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/webrtc/dataChannels/messageChannel.ts src/lib/features/webrtc/dataChannels/messageChannel*.test.ts
git commit -m "refactor: use peerId in message channel"
```

### Task 4: Final Verification

- [ ] **Step 1: Run all tests in `src/lib/features/webrtc`**

Run: `npx vitest src/lib/features/webrtc`
Expected: PASS

- [ ] **Step 2: Run `tsc` to ensure no type errors**

Run: `npx tsc --noEmit`
Expected: PASS (or at least no errors in modified files)

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-04-26-task-3-refactor-atomic-action-manager.md
git commit -m "docs: add task 3 implementation plan"
```
