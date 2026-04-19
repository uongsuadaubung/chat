# Messaging Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify `roomId`, `recipientId`, and `peerId` into a single `peerId` for all 1-1 messaging operations and storage.

**Architecture:** Standardize identification of the "other party" in a conversation as `peerId`. Update Zod schemas, IndexedDB schema (v2), and all message-related function signatures.

**Tech Stack:** Svelte 5 (Runes), TypeScript, Zod, Dexie (IndexedDB), Vitest.

---

### Task 1: Update Core Types (Zod & TS)

**Files:**

- Modify: `src/lib/features/chat/types/chat.type.ts`
- Modify: `src/lib/features/webrtc/transaction.type.ts`

- [ ] **Step 1: Update `ChatMessageSchema` in `src/lib/features/chat/types/chat.type.ts`**
      Remove `recipientId` and `recipientName`, add `peerId`.

```typescript
export const ChatMessageSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  peerId: z.string(), // New: always points to the other person
  text: z.string().optional(),
  timestamp: z.number(),
  isSelf: z.boolean()
  // ... rest of the fields
});
```

- [ ] **Step 2: Update `DataChannelPayloadSchema` in `src/lib/features/chat/types/chat.type.ts`**
      Rename all `recipientId` fields to `peerId` in the discriminated union.

- [ ] **Step 3: Update `AtomicAction` in `src/lib/features/webrtc/transaction.type.ts`**
      Rename all `roomId` fields to `peerId`.

- [ ] **Step 4: Commit types**

```bash
git add src/lib/features/chat/types/chat.type.ts src/lib/features/webrtc/transaction.type.ts
git commit -m "refactor: rename identification fields to peerId in core types"
```

---

### Task 2: Database Migration & Standardization

**Files:**

- Modify: `src/lib/core/db.ts`

- [ ] **Step 1: Increment DB version and update schema**
      Update `P2PChatDatabase` constructor to version 2.

```typescript
this.version(2).stores({
  messages: 'id, peerId, [peerId+timestamp], timestamp, isDeleted, type, isPinned',
  files: 'fileId',
  contacts: 'peerId, addedAt',
  transactional_outbox: '++id, peerId, status, createdAt'
});
```

- [ ] **Step 2: Clean up `StoredChatMessage` and `saveMessageToDB`**
      Remove legacy `recipientId` logic and ensure `peerId` is always used.

- [ ] **Step 3: Commit DB changes**

```bash
git add src/lib/core/db.ts
git commit -m "refactor: upgrade database to v2 and standardize on peerId"
```

---

### Task 3: Refactor Atomic Action Manager & Message Channel

**Files:**

- Modify: `src/lib/features/webrtc/atomicActionManager.ts`
- Modify: `src/lib/features/webrtc/dataChannels/messageChannel.ts`

- [ ] **Step 1: Update `AtomicActionManager` logic**
      Replace `action.roomId` with `action.peerId` and update payload creation.

- [ ] **Step 2: Update `messageChannel.ts`**
      Rename `roomId` parameters to `peerId` in all exported functions (`sendMessage`, `deleteMessage`, etc.).
      Remove or refactor `getRoomId` to `getPeerId`.

- [ ] **Step 3: Commit Core Logic**

```bash
git add src/lib/features/webrtc/atomicActionManager.ts src/lib/features/webrtc/dataChannels/messageChannel.ts
git commit -m "refactor: use peerId in atomic actions and message channel"
```

---

### Task 4: Refactor Data Channel Handlers

**Files:**

- Modify: `src/lib/features/webrtc/dataChannel.ts`

- [ ] **Step 1: Standardize all `handle...Payload` functions**
      Ensure they use `payload.peerId` directly and remove "targetRoomId" guessing logic.

- [ ] **Step 2: Commit Handlers**

```bash
git add src/lib/features/webrtc/dataChannel.ts
git commit -m "refactor: standardize peerId usage in data channel handlers"
```

---

### Task 5: UI & Store Integration

**Files:**

- Modify: `src/lib/features/webrtc/webrtc.store.svelte.ts`
- Modify: `src/lib/features/chat/components/ChatMessages.svelte`
- Modify: `src/lib/features/chat/components/ChatInput.svelte`

- [ ] **Step 1: Update `webrtcStore` exports**
      Ensure exported functions use `peerId` nomenclature.

- [ ] **Step 2: Update Components**
      Change prop/variable names from `roomId` to `peerId` where applicable.

- [ ] **Step 3: Run full validation**
      `npm run lint && npm run check && npm run test`

- [ ] **Step 4: Final Commit**

```bash
git add .
git commit -m "refactor: complete messaging unification to peerId"
```
