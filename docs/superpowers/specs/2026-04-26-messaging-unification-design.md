# Spec: Messaging Unification (RoomId to PeerId)

- **Date:** 2026-04-26
- **Status:** Draft
- **Author:** Gemini CLI
- **Objective:** Unify all messaging identification concepts (`roomId`, `recipientId`) into a single `peerId` term for 1-1 P2P communication. Standardize function parameters and reset database schema.

---

## 1. Problem Statement

The current codebase uses multiple terms to identify the target of a message or action:

- `roomId`: Used in `AtomicAction` and signaling.
- `recipientId`: Used in `ChatMessage` and `DataChannelPayload`.
- `peerId`: Used in `ctx.messages`, `ContactRecord`, and some handlers.

In a 1-1 P2P architecture, these are semantically identical (the ID of the person you are talking to). This ambiguity leads to bugs (e.g., looking for messages in the wrong room) and makes the code harder to maintain.

## 2. Proposed Changes

### 2.1 Type Definitions (`src/lib/features/chat/types/chat.type.ts`)

- **`ChatMessage`**:
  - REMOVE `recipientId` and `recipientName`.
  - ADD `peerId: string`.
  - _Logic:_
    - If `isSelf: true`, `peerId` is the person who receives the message.
    - If `isSelf: false`, `peerId` is the person who sent the message (the remote peer).
- **`DataChannelPayload`**:
  - Rename `recipientId` to `peerId` in all union types (chat, react, delete, etc.).
- **`FileTransferMeta`**:
  - Ensure `senderId` is used consistently, but messaging wrapper uses `peerId`.

### 2.2 Transaction Types (`src/lib/features/webrtc/transaction.type.ts`)

- **`AtomicAction`**:
  - Rename all `roomId` fields to `peerId`.
- **`TransactionalOutboxRecord`**:
  - Already uses `peerId`, ensure it remains the primary identifier.

### 2.3 Database Schema (`src/lib/core/db.ts`)

- **Reset Migration**: Increment DB version from `1` to `2`.
- **`messages` table**:
  - Ensure `peerId` is a primary index.
  - Remove any legacy logic handling `recipientId`.
  - The `StoredChatMessage` type will strictly follow the new `ChatMessage` schema.

### 2.4 Standardization of Logic

- **`getRoomId`**: Rename to `getPeerId` or remove if redundant.
- **Handlers (`src/lib/features/webrtc/dataChannel.ts`)**:
  - All handlers (`handleMessageDelete`, `handleMessageEdit`, etc.) will use `const peerIdFromPayload = payload.peerId`.
  - Logic to "guess" `targetRoomId` using `ctx.currentUser.id` will be removed as `peerId` will always be the correct key for `ctx.messages[peerId]`.
- **Stores**:
  - `chatStore.selectedPeerId` will be the source of truth for all outgoing actions.

---

## 3. Data Flow Example (New Standard)

1. **User sends message**:
   - `chatStore.selectedPeerId` is used as `peerId`.
   - `AtomicAction` is created with `{ type: 'chat', peerId: 'target_abc', ... }`.
   - `ChatMessage` is created with `{ peerId: 'target_abc', isSelf: true, ... }`.
   - Network payload: `{ type: 'chat', message: { ... }, peerId: 'me_id' }`. (Note: when sending, we might send our own ID so the receiver knows who we are, or rely on WebRTC `peerId`).
   - **Correction**: In 1-1 P2P, the receiver knows the sender from the DataChannel connection. The payload `peerId` should always represent the _sender_ from the perspective of the receiver.

## 4. Migration Plan

1. Increment `db.version(2)`.
2. Clear all tables to ensure clean slate.
3. Apply mass rename across the codebase using surgical `replace` calls.

---

## 5. Verification Plan

1. **Types**: Verify `tsc` passes.
2. **Database**: Verify IndexedDB schema in DevTools.
3. **Logic**: Run existing Vitest suite (after updating tests to use new names).
4. **Integration**: Manually test message sending, editing, and deletion between two tabs.
