# CODEBASE MAP — P2P WebRTC Chat

> **Purpose of this file**: Helps AI understand the entire system without reading source code.
> Update this file when there are major architectural changes.
> Created: 2026-04-06 | Version: 2.4 (Atomic Transactions, Video Call, BlobCache, Backup System)

---

## 1. System Overview

**Project type**: Vite + Svelte 5 (Runes) SPA
**Purpose**: A decentralized, real-time peer-to-peer (P2P) chat and file transfer application with no server-side message storage.
**Main stack**:

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | Svelte 5 (Runes), Vite, TypeScript                                |
| Styling    | SCSS (Glassmorphism UI, CSS Variables for Themes)                 |
| Networking | WebRTC (`RTCDataChannel` for chat, file stream, and binary ACKs)  |
| Signaling  | Firebase Realtime Database (Offer/Answer/ICE exchange only)       |
| Storage    | IndexedDB via `dexie` (Message history, File Blobs, Outbox Queue) |
| Validation | Zod (runtime schema validation for all DataChannel payloads)      |
| Testing    | Vitest + @testing-library/svelte + fake-indexeddb                 |

---

## 2. Directory Structure

```text
src/
├── App.svelte                 # Root layout: TabLock gate → Lobby or Chat
├── app.css                    # Global CSS variables, themes, glassmorphism tokens
├── main.ts                    # Vite entry point
└── lib/
    ├── types.ts               # Re-exports from chat.types.ts (convenience barrel)
    ├── core/                  # Infrastructure & Global Singletons (no feature imports)
    │   ├── db.ts              # Dexie wrapper for IndexedDB (messages, files, outbox, transactional_outbox)
    │   ├── firebase.ts        # Firebase SDK setup & DB exports
    │   ├── logger.ts          # Namespaced console logger (log.dc, log.webrtc, log.db...)
    │   ├── tabLock.ts         # BroadcastChannel lock — prevents multi-tab P2P collision
    │   ├── utils.ts           # Pure helpers: shouldInitiate(), isValidSignal()
    │   ├── wakeLock.ts        # Screen Wake Lock API wrapper
    │   ├── blobCache.ts       # Blob URL cache manager with ref counting (prevents memory leaks)
    │   ├── backup.ts          # Data Export/Import via fflate (zip format with JSON + file blobs)
    │   └── workers/           # Web Workers
    │       └── fileReader.worker.ts  # Offloads ArrayBuffer slicing off main thread
    │
    ├── features/              # Feature-Sliced Domains
    |   ├── chat/              # Chat UI layer
    |   |   ├── MessengerLayout.svelte       # Root chat wrapper (Sidebar + View panel)
    |   |   ├── components/
    |   |   |   ├── ChatMessages.svelte      # Message list, auto-scroll, read tracking
    |   |   |   ├── ChatInput.svelte         # Text input, file picker, voice recording
    |   |   |   ├── sidebar/                 # Modular sidebar navigation with encryption notice
    |   |   |   |   ├── SidebarOverview.svelte
    |   |   |   |   ├── SidebarPinned.svelte # Pinned messages UI
    |   |   |   |   └── SidebarSearch.svelte
    |   |   |   ├── MessageBubble.svelte     # Per-message renderer (reply, reactions, edit)
    |   |   |   ├── MessageActions.svelte    # Context menu: edit, delete, react, reply
    │   │   │   ├── EmojiMenu.svelte         # Emoji picker for reactions
    │   │   │   ├── AttachMenu.svelte        # File/Voice attach menu
    │   │   │   ├── TypingIndicator.svelte   # Animated typing dots
    │   │   │   ├── SystemMessageBubble.svelte  # screen_share_start/stop events
    │   │   │   ├── attachments/
    │   │   │   │   ├── AudioAttachment.svelte   # Voice message playback + waveform
    │   │   │   │   ├── AudioVisualizer.svelte   # Real-time audio waveform canvas
    │   │   │   │   ├── FileAttachment.svelte    # Generic file download UI
    │   │   │   │   ├── ImageAttachment.svelte   # Image with lightbox preview
    │   │   │   │   ├── VideoAttachment.svelte   # Video with inline player
    │   │   │   │   └── TransferProgress.svelte  # File transfer progress bar
    │   │   │   └── media/
    │   │   │       ├── VideoPlayer.svelte        # Full-screen video modal
    │   │   │       ├── VideoCallModal.svelte     # Video call UI (incoming/outgoing/active)
    │   │   │       └── CallPlayer.svelte         # Active call display with controls
    │   │   ├── constants/
    │   │   │   ├── chat.constants.ts        # MAX_MESSAGE_HISTORY, etc.
    │   │   │   └── emoji.constants.ts       # Full emoji dataset for picker
    │   │   ├── stores/
    │   │   │   └── chat.store.svelte.ts     # selectedPeerId reactive state
    │   │   ├── types/
    │   │   │   └── chat.types.ts            # Zod schemas + inferred TS types (source of truth)
    │   │   ├── utils.ts                     # Chat formatting helpers
    │   │   └── utils.test.ts
    │   │
    │   ├── i18n/
    │   │   ├── i18n.store.svelte.ts         # Language store, t() lookup, locale switching
    │   │   └── i18n.store.test.ts
    │   │
    │   ├── lobby/
    │   │   └── components/                  # Name input, room link generator, join UI
    │   │
    │   └── webrtc/            # Core P2P networking module
    │       ├── webrtc.store.ts              # Public API facade for UI (single entry point)
    │       ├── webrtc.context.svelte.ts     # WebRTCState class — $state singleton (ctx)
    │       ├── webrtc.constants.ts          # ICE config, chunk sizes, protocol constants
    │       ├── room.ts                      # Join/leave room, Firebase presence, signal listeners
    │       ├── peerConnection.ts            # RTCPeerConnection setup, ICE retry, screen share
    │       ├── peers.ts                     # Peer list CRUD (updatePeerStatus, removePeer)
    │       ├── atomicActionManager.ts       # Atomic transactions with rollback (pin, edit, delete, react)
    │       ├── outboxProcessor.ts           # Background processor for failed transaction retries
    │       ├── transaction.type.ts          # AtomicAction & TransactionalOutboxRecord types
    │       ├── transaction.util.ts          # State capture & rollback helpers
    │       ├── signaling.ts                 # Send/receive Firebase signals (offer/answer/candidate)
    │       ├── dataChannel.ts               # DataChannel facade: routes payloads to handlers
    │       ├── types/
    │       │   ├── webrtc.types.ts          # IncomingFile, OutgoingFile, WebRTCContext interfaces
    │       │   └── signal.types.ts          # Signal union type (offer, answer, candidate)
    │       └── dataChannels/
    │           ├── channelUtils.ts          # sendToPeer() helper
    │           ├── messageChannel.ts        # Text messages, edit, delete, react, read receipts
    │           └── fileTransfer/
    │               ├── index.ts             # Barrel re-export
    │               ├── fileSender.ts        # Chunked binary sending with backpressure
    │               ├── fileReceiver.ts      # Chunk reassembly: FSAPI path + RAM fallback
    │               ├── fileAcks.ts          # Binary ACK batching, progress updates (RAF-batched)
    │               └── fileReader.ts        # Worker bridge for background ArrayBuffer slicing
    │
    └── shared/                # Generic UI — no feature-specific logic
        ├── components/
        │   ├── GlassButton.svelte           # Themed button with glass/solid variants
        │   ├── SettingsModal.svelte         # App settings + Data Export/Import UI
        │   ├── ToastContainer.svelte        # Global toast notification overlay
        │   ├── TabBlocked.svelte            # "Another tab is active" warning screen
        │   ├── ImagePreviewModal.svelte     # Full-screen image lightbox
        │   ├── VideoPreviewModal.svelte     # Full-screen video lightbox
        │   ├── FileCategoryIcon.svelte      # File type icon resolver
        │   ├── UserAvatar.svelte            # Standardized universal avatar component
        │   └── icons/                       # SVG icon components (no emoji text)
        └── stores/
            ├── appSettings.store.svelte.ts  # Theme, glass toggle, screen share profile
            ├── auth.store.svelte.ts         # User identity (name, generated ID)
            ├── toast.store.svelte.ts        # Global toast queue
            └── ui.store.svelte.ts           # Generic transient UI flags
```

> **Architectural rule**: `core/` has zero imports from `features/` or `shared/`. `shared/` has zero imports from `features/`. Feature modules may import from `core/` and `shared/` only.

---

## 3. Architecture & Data Flow

### 3.1 P2P Connection Lifecycle

```text
joinRoom(roomId, user, password?)
    │
    ├─► Firebase: set presence at rooms/{roomId}/users/{userId}
    ├─► Firebase listener: onChildAdded(usersRef) → setupPeerConnection(peerId)
    │       └─► RTCPeerConnection + ICE candidates exchanged via Firebase signals
    │       └─► RTCDataChannel created by initiator (shouldInitiate() determines role)
    │
    └─► setupDataChannel(peerId, dc)
            └─► dc.onmessage → handleBinaryFileChunk | handleBinaryAckBatch | handleDataChannelMessage
```

### 3.2 State Management & Persistence

- **Single reactive context**: `ctx` is an instance of `WebRTCState` (class with `$state` fields). All services read/write `ctx` directly — no Svelte stores passed around.
- **Local Database (IndexedDB)**: `lib/core/db.ts` using `dexie`. Stores `messages`, `files` (Blob), and an `outbox` queue. Supports Data Export/Import via JSON blobs. Enables full context restoration on page reload (F5) and handles offline scenarios by queueing payloads.
- **Public API surface**: `webrtc.store.ts` exposes getters (`webrtc.messages`, `webrtc.peers`) and action methods to UI components. UI components never import service files directly.
- **Message storage**: `ctx.messages` is `Record<peerId, ChatMessage[]>` — all messages are keyed by peer ID (1-1 model). Syncs continuously with IndexedDB.
- **File state**: `ctx.incomingFiles` / `ctx.outgoingFiles` are `Map<fileId, IncomingFile|OutgoingFile>`. A parallel `fileIndex: Map<fileId, roomId>` in `messageChannel.ts` enables O(1) progress update lookups without scanning `ctx.messages`.

### 3.3 DataChannel Message Protocol

All JSON messages sent over `RTCDataChannel` are validated via `DataChannelPayloadSchema` (Zod discriminated union). Current supported types:

| Type                 | Direction       | Description                                  |
| -------------------- | --------------- | -------------------------------------------- |
| `chat`               | both            | Text/system/file message                     |
| `typing`             | both            | Typing indicator                             |
| `message_edit`       | both            | Edit existing message                        |
| `message_delete`     | both            | Delete for all peers                         |
| `message_hide_local` | both            | Hide from specific peer's view               |
| `message_pin`        | both            | Toggle message pinned status                 |
| `message_react`      | both            | Emoji reaction toggle                        |
| `message_read`       | receiver→sender | Single read receipt                          |
| `message_read_batch` | receiver→sender | Batch read receipts (avoids N+1 signal spam) |
| `file_meta`          | sender→receiver | File transfer announcement                   |
| `file_ack`           | receiver→sender | Legacy single ACK (compat only)              |
| `file_request`       | receiver→sender | Re-request missing chunks                    |
| `file_download_req`  | receiver→sender | Start download signal                        |
| `sync_ready`         | both            | Message count handshake for sync             |
| `sync_req`           | both            | Request full message dump                    |
| `sync_data`          | both            | Batch message sync payload                   |
| `ping` / `pong`      | both            | Keep-alive for NAT timeout prevention        |

> **Legacy fallback**: Raw JSON without `type` field (old clients) is wrapped into a `chat` payload and re-validated through the schema before processing.

---

## 4. Module Details

### `webrtc/webrtc.store.ts` — Public API Facade

Single entry point for all UI interactions. Exposes reactive getters and action methods. Never contains business logic. UI never imports service files directly.

**Key actions**: `joinRoom`, `leaveRoom`, `sendChat`, `sendFile`, `requestDownload`, `editMessage`, `deleteMessage`, `reactMessage`, `markAsRead` (uses `sendReadReceiptBatch`), `startScreenShare`, `stopScreenShare`, `retryConnection`, `syncMessages`.

### `webrtc/room.ts` — Session Management

Handles room join/leave lifecycle. On `leaveRoom()`: state resets and Firebase listeners are unsubscribed **synchronously** before any `await`. Firebase cleanup runs async afterward but cannot affect new sessions.

### `webrtc/peerConnection.ts` — Peer Negotiation

- Implements Perfect Negotiation Pattern (`onnegotiationneeded` + `makingOfferFor` guard).
- ICE retry with exponential backoff (max `MAX_ICE_RETRIES`, configurable in constants).
- Screen share: `startScreenShare()` silently absorbs `NotAllowedError` (user denied) without re-throwing; only unexpected errors propagate.
- **Connection Recovery & Drops**: `pc.onconnectionstatechange` acts as a fail-safe. If `disconnected` or `closed` during an active call, automatically invokes `resetCallState()` and throws an i18n disconnect error.
- **Media Stream Separation**: Checks `ctx.localMediaStream` and forces `stopScreenShare()` before initiating or accepting a call (`getUserMedia()`) to prevent Camera streams from overwriting and leaking background screen-share Desktop streams.

### `webrtc/dataChannel.ts` — Message Router

Routes incoming JSON/binary DataChannel messages. On JSON: validates through `DataChannelPayloadSchema.safeParse()`. Dispatches to `handleDataChannelMessage()`. Maintains keep-alive `ping/pong` via `setInterval`.

### `dataChannels/messageChannel.ts` — Text Messaging

- `addMessage` / `addMessagesBatch`: maintain `ctx.messages` immutably and trim to `MAX_MESSAGE_HISTORY`. Also writes transparently to `db.ts` (IndexedDB). When trimming, entries for file messages are removed from `fileIndex` and their blobs are revoked from memory (garbage collection).
- `editMessage` / `reactMessage`: always clone the array before mutation (immutability pattern consistent with `deleteMessage`). Saved to DB.
- `sendReadReceiptBatch`: sends a single `message_read_batch` signal for multiple IDs, or falls back to single `message_read` for 1 message — prevents N+1 signal spam in `markAsRead`.
- `loadAllHistoryFromDB` / `loadOlderMessages`: Enables finite scrolling & jump-to-message using Dexie ranges.

### `dataChannels/fileTransfer/` — File Transfer Engine

**Protocol**: Pull-based. Receiver sends `file_download_req` → sender streams binary chunks.

**Binary chunk format**: `[36 bytes fileId (ASCII UUID)][4 bytes chunkIndex (Uint32 LE)][...chunk data]`

- Constants: `FILE_ID_BYTES = 36`, `FILE_CHUNK_HEADER_BYTES = 40` (in `webrtc.constants.ts`)

**Two receiver paths**:

1. **FSAPI path** (preferred): `FileSystemWritableFileStream` writes directly to disk. Uses a **promise queue** (`fsWritableQueue`) to guarantee sequential writes — prevents concurrent write corruption from out-of-order chunk delivery.
2. **RAM fallback**: chunks stored in `IncomingFile.chunks[]`, assembled into a `Blob` at completion. `URL.createObjectURL()` is called once and stored in `ctx.messages`.

**ACK system** (`fileAcks.ts`):

- Binary ACK format: `[1 byte magic=0xAC][36 bytes fileId][4 bytes count][4 bytes × N chunkIndices]`
- ACKs are queued and flushed every `ACK_BATCH_INTERVAL_MS` (50ms) — reduces ACK traffic by ~99%.
- Progress updates are RAF-batched: non-terminal updates via `requestAnimationFrame`, completion/error flushes immediately.
- `totalBytesReceived` is capped at `Math.min(chunks * CHUNK_SIZE, meta.size)` to avoid inflated display for the final chunk.

### `core/` — Infrastructure

- **`db.ts`**: Standardized IndexedDB access using `dexie`. Stores messages & binary files persistently. Includes an internal outbox system that guarantees sync if peers F5 or disconnect briefly. Also stores `transactional_outbox` for atomic transaction tracking.
- **`blobCache.ts`**: Blob URL cache manager with reference counting. Prevents memory leaks by tracking `acquire()` and `release()` calls. Uses `URL.createObjectURL()` for file previews. Handles race conditions with pending queue.
- **`backup.ts`**: Data Export/Import system using `fflate` (zip format). Exports `data.json` (messages, contacts, localStorage) + `files/` folder. Import restores IndexedDB and triggers page reload.
- **`logger.ts`**: Namespaced loggers (`log.dc`, `log.webrtc`, `log.signal`, `log.ice`, `log.room`, `log.db`, `log.negotiation`, `log.transaction`). Can be silenced by namespace.
- **`tabLock.ts`**: Uses `BroadcastChannel` (with `localStorage` fallback) to ensure only one tab runs P2P to avoid Firebase signal collision.
- **`utils.ts`**: `shouldInitiate(myId, peerId)` — deterministic lexicographic comparison for which peer creates the offer. `isValidSignal()` — runtime guard before processing Firebase data.

---

## 5. Type System

**Central schema file**: `src/lib/features/chat/types/chat.types.ts`

All runtime-validated types are Zod schemas with inferred TypeScript types:

- `ChatMessage` / `ChatMessageSchema`
- `DataChannelPayload` / `DataChannelPayloadSchema` — discriminated union of all 16 payload types
- `FileTransferMeta` / `FileTransferMetaSchema`
- `PeerUser` / `PeerUserSchema`
- `FileAttach` / `FileAttachSchema`

Internal WebRTC types (not network-facing):

- `IncomingFile` — includes `fsWritableQueue?: Promise<void>` (sequential write guard)
- `OutgoingFile` — tracks per-peer ACK sets and rate metrics
- `WebRTCContext` — full interface for `WebRTCState` class

---

## 6. UI Conventions & Standards

- **Universal UserAvatar**: Always use `UserAvatar.svelte` for identity display (avoids redundant/hardcoded initials logic).
- **Encryption Notice Location**: Never place inline in message flows. Position in structural safe-zones (e.g., Sidebar room info or Chat empty states).
- **No hardcoded colors**: All colors use CSS `var(--token)`. Strict enforcement via `.agents/rules/rule-ui-standard-strict.md`.
- **No emoji in code**: All icons are SVG components in `shared/components/icons/`.
- **No hardcoded strings**: All user-visible text goes through `i18n.t('key')`.
- **Glassmorphism**: `backdrop-filter: blur`, `var(--glass-bg)`, `var(--glass-border)`. Can be disabled via `appSettings.enableGlass` → `[data-glass='false']` CSS fallback. Voice calls utilize Mesh Gradients (blobs) behind heavily blurred `-webkit-backdrop-filter` for fluid spatial UI.
- **Svelte 5 `$effect` cleanup**: All `setTimeout`/`setInterval` created inside `$effect` must return a cleanup function `() => clearTimeout(timer)`.
- **Error handling**: All `catch` clauses must type `e: unknown`. No silent `catch {}` or bare `console.log`. Rule: `rule-error-handling-explicit.md`.

---

## 7. Quality Assurance

- **Testing**: Vitest + `@testing-library/svelte`. Tests co-located with source (e.g. `webrtc.store.test.ts`, `messageChannel.test.ts`, `fileTransfer.ack.test.ts`). Focus: store consistency, ACK batching, file sync, i18n.
- **Lint**: ESLint (Svelte 5 Runes-aware) + Prettier. Enforced via `lint-staged`.
- **Git Hooks**: Husky pre-commit — full test suite must pass before any commit.
- **Agent Rules** (`.agents/rules/`):
  - `rule-error-handling-explicit.md` — typed errors, no silent catch
  - `rule-minimal-footprint.md` — smallest change that solves the problem
  - `rule-no-hardcoded-secrets.md` — env vars only
  - `rule-no-silent-assumptions.md` — ask when ambiguous
  - `rule-preserve-comments.md` — keep comments unless logic is deleted
  - `rule-test-before-done.md` — verify with commands before claiming done

---

## 8. CI/CD

- **GitHub Actions** (`.github/workflows/deploy.yml`): Triggers on Release Tag → bumps version → builds static bundle → deploys to `gh-pages` → cleans old deployments via GitHub CLI.
- **Version bumping**: `scripts/bump-version.mjs` syncs `package.json` + `package-lock.json`.

---

## 9. AI Gotchas

- **`ctx` is not a Svelte store** — it's a plain class instance with `$state` fields. Do NOT use `get(ctx)` or `ctx.subscribe()`. Read fields directly: `ctx.messages`, `ctx.peers`.
- **`webrtc.store.ts` is the only UI-facing API** — never import `room.ts`, `peerConnection.ts`, or service files directly from Svelte components.
- **Promise queue in FSAPI path** — `incoming.fsWritableQueue` chains writes sequentially. Do not introduce any parallel write paths.
- **`fileIndex` must stay in sync** — when adding file messages, set `fileIndex.set(id, roomId)`. When removing (delete, hide, slice), call `fileIndex.delete(id)`. Missing this causes progress updates to silently drop.
- **`message_read_batch`** — receiver sends a single batch signal for multiple unread messages. Both `message_read` (single) and `message_read_batch` (multi) must be handled in `dataChannel.ts`.
- **Legacy DataChannel fallback** — raw JSON without `type` field from old clients is re-wrapped and re-validated through `DataChannelPayloadSchema` before dispatching. Never `addMessage()` directly from unvalidated input.
- **WebRTC buffer backpressure** — file senders listen to `dc.onbufferedamountlow`. Do NOT use tight `while` loops without yielding. Use `await waitForBufferDrain()` pattern in `fileSender.ts`.
- **Tab lock** — only one browser tab can run P2P. `tabLock.ts` uses `BroadcastChannel` to enforce this. The second tab sees `TabBlocked.svelte`.
- **`shouldInitiate(myId, peerId)`** — deterministic: the peer with the lexicographically smaller ID creates the offer. Pure function, safe to test.
- **Media Stream Duality** — `ctx.localMediaStream` stores BOTH desktop capture AND webcam capture, mutually exclusively. Before assigning `getUserMedia()` outputs, ALWAY check and `stopScreenShare()` to prevent dangling RAM leaks and un-stoppable capturing. WebRTC `stop()` functions do NOT inherently clear UI state.
- **IndexedDB Sync (F5 Recovery)** — When a user reloads (F5), they lose RAM but retain IndexedDB. Re-connection triggers `handleSyncData` which recovers states from DB, resending missed outbox messages and automatically requesting file blob resumes from peers if file sizes map perfectly. No manual redownload is needed for small media.
- **Atomic Transactions** — Pin, edit, delete, and react operations use `AtomicActionManager` with optimistic UI updates + rollback on failure. Actions stored in `transactional_outbox` table with `pending` → `completed` / `rolled_back` states. Background `OutboxProcessor` retries failed transactions every 30s and cleans up completed ones older than 7 days.
- **BlobCache ref counting** — Always call `blobCache.release(id)` when done with file previews. Memory leaks occur if acquire without release. Race condition handled via pending queue.
- **Video Call flow** — `VideoCallModal.svelte` handles incoming/outgoing/active states. Uses `getUserMedia` for camera, separate from screen share. Media streams stored in `ctx.localMediaStream`.
- **Transaction status types** — `pending` (initial) → `processing` → `completed` | `failed` | `rolled_back`. Retry logic checks `retries < maxRetries` before re-attempting.

---

_Last updated: 2026-04-17 — Mapping Codebase Update v2.4_
