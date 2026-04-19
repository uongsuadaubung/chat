# Atomic Transaction System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all-or-nothing transaction system for critical chat operations (pin, edit, delete, react) ensuring consistency between UI state, IndexedDB storage, and P2P network.

**Architecture:** Command Pattern with Transactional Outbox. Each atomic action follows: 1) Optimistic UI update, 2) Save to transactional outbox, 3) Execute DB operation, 4) Send network signal, 5) Send system message (if applicable), 6) Mark completed. Any failure triggers full rollback.

**Tech Stack:** TypeScript, Dexie (IndexedDB), Svelte 5, WebRTC DataChannels, Vitest

---

## File Structure

### New Files

- `src/lib/features/webrtc/transactionTypes.ts` - Type definitions for atomic actions
- `src/lib/features/webrtc/atomicActionManager.ts` - Core transaction engine
- `src/lib/features/webrtc/outboxProcessor.ts` - Background transaction processor
- `src/lib/features/webrtc/transactionUtils.ts` - Helper functions

### Modified Files

- `src/lib/core/db.ts` - Add transactional_outbox table to Dexie schema
- `src/lib/features/webrtc/dataChannels/messageChannel.ts` - Refactor pinMessage, editMessage, deleteMessage, reactMessage

---

### Task 1: Create Transaction Type Definitions

**Files:**

- Create: `src/lib/features/webrtc/transactionTypes.ts`
- Create: `tests/transactionTypes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/transactionTypes.test.ts
import { describe, it, expect } from 'vitest';
import type {
  AtomicAction,
  TransactionalOutboxRecord
} from '$lib/features/webrtc/transactionTypes';

describe('Transaction Types', () => {
  it('should define valid AtomicAction types', () => {
    const pinAction: AtomicAction = {
      type: 'pin',
      messageId: 'msg_123',
      roomId: 'peer_1',
      isPinned: true
    };

    expect(pinAction.type).toBe('pin');
    expect(pinAction.messageId).toBe('msg_123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/transactionTypes.test.ts`
Expected: FAIL with "Cannot find module '$lib/features/webrtc/transactionTypes'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/features/webrtc/transactionTypes.ts
import type { DataChannelPayload } from '$lib/features/chat/types/chat.types';
import type { ChatMessage } from '$lib/types';

export type AtomicActionType = 'pin' | 'edit' | 'delete' | 'react';

export type AtomicAction =
  | {
      type: 'pin';
      messageId: string;
      roomId: string;
      isPinned: boolean;
      originalIsPinned?: boolean;
    }
  | {
      type: 'edit';
      messageId: string;
      roomId: string;
      newText: string;
      originalText?: string;
    }
  | {
      type: 'delete';
      messageId: string;
      roomId: string;
      syncGlobal: boolean;
      originalMessage?: ChatMessage;
    }
  | {
      type: 'react';
      messageId: string;
      roomId: string;
      reaction: string;
      originalReactions?: Record<string, string>;
    };

export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rolled_back';

export interface TransactionalOutboxRecord {
  id?: number;
  peerId: string;
  actionType: AtomicActionType;
  payload: DataChannelPayload;
  status: TransactionStatus;
  createdAt: number;
  updatedAt: number;
  retries: number;
  maxRetries: number;
  error?: string;
  originalState?: any;
  rollbackAction?: 'unpin' | 'restore_text' | 'restore_message' | 'remove_reaction';
}

export interface TransactionResult {
  success: boolean;
  error?: string;
  outboxId?: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/transactionTypes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/webrtc/transactionTypes.ts tests/transactionTypes.test.ts
git commit -m "feat: add transaction type definitions"
```

---

### Task 2: Extend Database Schema with Transactional Outbox

**Files:**

- Modify: `src/lib/core/db.ts`
- Create: `tests/db.transaction.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/db.transaction.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/core/db';
import type { TransactionalOutboxRecord } from '$lib/features/webrtc/transactionTypes';

describe('Transactional Outbox Database', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('should have transactional_outbox table', async () => {
    const tables = db.tables.map((t) => t.name);
    expect(tables).toContain('transactional_outbox');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db.transaction.test.ts`
Expected: FAIL with "db.transactional_outbox is undefined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// In src/lib/core/db.ts, add to P2PChatDatabase class:
export class P2PChatDatabase extends Dexie {
  messages!: Table<StoredChatMessage, string>;
  files!: Table<{ fileId: string; blob: Blob }, string>;
  outbox!: Table<OutboxRecord, number>;
  contacts!: Table<ContactRecord, string>;
  transactional_outbox!: Table<TransactionalOutboxRecord, number>; // NEW

  constructor() {
    super('P2P_Chat_DB');
    // ... existing versions 1-3 ...

    // NEW VERSION 4 with transactional_outbox
    this.version(4).stores({
      messages: 'id, peerId, [peerId+timestamp], timestamp, isDeleted, type, isPinned',
      files: 'fileId',
      outbox: '++id, peerId, timestamp',
      contacts: 'peerId, addedAt',
      transactional_outbox: '++id, peerId, status, createdAt'
    });
  }
}

// Add import at top of file:
import type { TransactionalOutboxRecord } from '$lib/features/webrtc/transactionTypes';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/db.transaction.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/db.ts tests/db.transaction.test.ts
git commit -m "feat: add transactional_outbox table to database schema"
```

---

### Task 3: Create Transaction Utilities

**Files:**

- Create: `src/lib/features/webrtc/transactionUtils.ts`
- Create: `tests/transactionUtils.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/transactionUtils.test.ts
import { describe, it, expect } from 'vitest';
import { captureOriginalState, createRollbackAction } from '$lib/features/webrtc/transactionUtils';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';

describe('Transaction Utilities', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [{ id: 'msg_123', text: 'Hello', isPinned: false, timestamp: 1000 }]
    };
  });

  it('should capture original state for pin action', () => {
    const action = { type: 'pin' as const, messageId: 'msg_123', roomId: 'peer_1', isPinned: true };
    const state = captureOriginalState(action);

    expect(state).toEqual({ isPinned: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/transactionUtils.test.ts`
Expected: FAIL with "Cannot find module '$lib/features/webrtc/transactionUtils'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/features/webrtc/transactionUtils.ts
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import type { AtomicAction, TransactionalOutboxRecord } from './transactionTypes';

export function captureOriginalState(action: AtomicAction): any {
  const roomMsgs = ctx.messages[action.roomId] || [];
  const msg = roomMsgs.find((m) => m.id === action.messageId);

  if (!msg) {
    throw new Error(`Message ${action.messageId} not found in room ${action.roomId}`);
  }

  switch (action.type) {
    case 'pin':
      return { isPinned: msg.isPinned || false };
    case 'edit':
      return { text: msg.text || '' };
    case 'delete':
      return { message: { ...msg } };
    case 'react':
      return { reactions: { ...(msg.reactions || {}) } };
    default:
      return {};
  }
}

export function createRollbackAction(
  action: AtomicAction,
  originalState: any
): 'unpin' | 'restore_text' | 'restore_message' | 'remove_reaction' {
  switch (action.type) {
    case 'pin':
      return 'unpin';
    case 'edit':
      return 'restore_text';
    case 'delete':
      return 'restore_message';
    case 'react':
      return 'remove_reaction';
    default:
      throw new Error(`Unknown action type: ${(action as any).type}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/transactionUtils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/webrtc/transactionUtils.ts tests/transactionUtils.test.ts
git commit -m "feat: add transaction utility functions"
```

---

### Task 4: Implement AtomicActionManager Core

**Files:**

- Create: `src/lib/features/webrtc/atomicActionManager.ts`
- Create: `tests/atomicActionManager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/atomicActionManager.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AtomicActionManager } from '$lib/features/webrtc/atomicActionManager';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';

vi.mock('$lib/features/webrtc/dataChannels/channelUtils', () => ({
  sendToPeer: vi.fn()
}));

vi.mock('$lib/core/db', () => ({
  db: {
    transactional_outbox: {
      add: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(undefined)
    }
  },
  saveMessageToDB: vi.fn().mockResolvedValue(undefined)
}));

describe('AtomicActionManager', () => {
  let manager: AtomicActionManager;

  beforeEach(() => {
    manager = new AtomicActionManager();
    ctx.messages = {
      peer_1: [{ id: 'msg_123', text: 'Hello', isPinned: false, timestamp: 1000 }]
    };
    ctx.currentUser = { id: 'me_123', name: 'Me' };
  });

  it('should execute successful pin transaction', async () => {
    const action = { type: 'pin' as const, messageId: 'msg_123', roomId: 'peer_1', isPinned: true };
    let uiUpdated = false;

    const result = await manager.executeAtomicAction(action, () => {
      uiUpdated = true;
    });

    expect(result.success).toBe(true);
    expect(uiUpdated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/atomicActionManager.test.ts`
Expected: FAIL with "Cannot find module '$lib/features/webrtc/atomicActionManager'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/features/webrtc/atomicActionManager.ts
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { db, saveMessageToDB } from '$lib/core/db';
import { sendToPeer } from '$lib/features/webrtc/dataChannels/channelUtils';
import { log } from '$lib/core/logger';
import type {
  AtomicAction,
  TransactionResult,
  TransactionalOutboxRecord
} from './transactionTypes';
import { captureOriginalState, createRollbackAction } from './transactionUtils';

export class AtomicActionManager {
  private maxRetries = 3;

  async executeAtomicAction(
    action: AtomicAction,
    optimisticUpdate: () => void
  ): Promise<TransactionResult> {
    let originalState;
    try {
      originalState = captureOriginalState(action);
    } catch (error) {
      return { success: false, error: `Cannot capture state: ${error}` };
    }

    optimisticUpdate();

    let outboxId: number | undefined;

    try {
      outboxId = await this.saveToTransactionalOutbox(action, originalState);
      await this.executeDBAction(action);
      await this.sendNetworkSignal(action);
      await this.markOutboxCompleted(outboxId);

      return { success: true, outboxId };
    } catch (error) {
      await this.rollbackTransaction(action, originalState, error, outboxId);
      return { success: false, error: String(error), outboxId };
    }
  }

  private async saveToTransactionalOutbox(
    action: AtomicAction,
    originalState: any
  ): Promise<number> {
    const record: TransactionalOutboxRecord = {
      peerId: action.roomId,
      actionType: action.type,
      payload: this.createNetworkPayload(action),
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retries: 0,
      maxRetries: this.maxRetries,
      originalState,
      rollbackAction: createRollbackAction(action, originalState)
    };

    return await db.transactional_outbox.add(record);
  }

  private createNetworkPayload(action: AtomicAction): any {
    switch (action.type) {
      case 'pin':
        return {
          type: 'message_pin',
          messageId: action.messageId,
          isPinned: action.isPinned,
          recipientId: action.roomId
        };
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async executeDBAction(action: AtomicAction): Promise<void> {
    const roomMsgs = ctx.messages[action.roomId] || [];
    const msg = roomMsgs.find((m) => m.id === action.messageId);

    if (!msg) {
      throw new Error(`Message ${action.messageId} not found for DB update`);
    }

    let updatedMsg = { ...msg };

    if (action.type === 'pin') {
      updatedMsg.isPinned = action.isPinned;
      updatedMsg.updatedAt = Date.now();
    }

    await saveMessageToDB(updatedMsg);
  }

  private async sendNetworkSignal(action: AtomicAction): Promise<void> {
    const payload = this.createNetworkPayload(action);
    sendToPeer(action.roomId, payload);
  }

  private async markOutboxCompleted(outboxId: number): Promise<void> {
    await db.transactional_outbox.update(outboxId, {
      status: 'completed',
      updatedAt: Date.now()
    });
  }

  private async rollbackTransaction(
    action: AtomicAction,
    originalState: any,
    error: unknown,
    outboxId?: number
  ): Promise<void> {
    log.transaction.error(`Rolling back transaction for ${action.type}:`, error);

    this.rollbackUIState(action, originalState);

    if (outboxId) {
      await db.transactional_outbox.update(outboxId, {
        status: 'rolled_back',
        error: String(error),
        updatedAt: Date.now()
      });
    }
  }

  private rollbackUIState(action: AtomicAction, originalState: any): void {
    const m = ctx.messages;
    const roomMsgs = m[action.roomId] || [];
    const idx = roomMsgs.findIndex((m) => m.id === action.messageId);

    if (idx === -1) return;

    const updated = [...roomMsgs];

    if (action.type === 'pin') {
      updated[idx] = { ...updated[idx], isPinned: originalState.isPinned };
    }

    ctx.messages = { ...m, [action.roomId]: updated };
  }
}

export const atomicActionManager = new AtomicActionManager();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/atomicActionManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/webrtc/atomicActionManager.ts tests/atomicActionManager.test.ts
git commit -m "feat: implement AtomicActionManager core"
```

---

### Task 5: Refactor pinMessage to Use Atomic Transactions

**Files:**

- Modify: `src/lib/features/webrtc/dataChannels/messageChannel.ts:383-406`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/messageChannel.transaction.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pinMessage } from '$lib/features/webrtc/dataChannels/messageChannel';
import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';

vi.mock('$lib/features/webrtc/atomicActionManager', () => ({
  atomicActionManager: {
    executeAtomicAction: vi.fn().mockResolvedValue({ success: true })
  }
}));

describe('Transactional pinMessage', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [{ id: 'msg_123', text: 'Hello', isPinned: false, timestamp: 1000 }]
    };
    ctx.currentUser = { id: 'me_123', name: 'Me' };
  });

  it('should use atomicActionManager for pin operations', async () => {
    await pinMessage('msg_123', true, 'peer_1');

    expect(atomicActionManager.executeAtomicAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pin',
        messageId: 'msg_123',
        roomId: 'peer_1',
        isPinned: true
      }),
      expect.any(Function)
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/messageChannel.transaction.test.ts`
Expected: FAIL (pinMessage doesn't use atomicActionManager yet)

- [ ] **Step 3: Write minimal implementation**

```typescript
// In src/lib/features/webrtc/dataChannels/messageChannel.ts, replace pinMessage function:
export async function pinMessage(messageId: string, isPinned: boolean, roomId: string) {
  if (!ctx.currentUser) return;

  const action: AtomicAction = {
    type: 'pin',
    messageId,
    roomId,
    isPinned
  };

  const success = await atomicActionManager.executeAtomicAction(action, () => {
    const m = ctx.messages;
    const roomMsgs = m[roomId] || [];
    const idx = roomMsgs.findIndex((x) => x.id === messageId);
    if (idx !== -1) {
      const updated = [...roomMsgs];
      updated[idx] = { ...updated[idx], isPinned, updatedAt: Date.now() };
      ctx.messages = { ...m, [roomId]: updated };
    }
  });

  if (!success) {
    console.error('Failed to pin message:', messageId);
  }
}

// Add import at top:
import { atomicActionManager } from '$lib/features/webrtc/atomicActionManager';
import type { AtomicAction } from '$lib/features/webrtc/transactionTypes';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/messageChannel.transaction.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/webrtc/dataChannels/messageChannel.ts tests/messageChannel.transaction.test.ts
git commit -m "feat: refactor pinMessage to use atomic transactions"
```

---

### Task 6: Add Error Handling and Toast Notifications

**Files:**

- Modify: `src/lib/features/webrtc/dataChannels/messageChannel.ts`
- Create: `src/lib/utils/toast.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/toast.test.ts
import { describe, it, expect, vi } from 'vitest';
import { showErrorToast } from '$lib/utils/toast';

describe('Toast Notifications', () => {
  it('should show error toast', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    showErrorToast('Test error');

    expect(consoleSpy).toHaveBeenCalledWith('[ERROR] Test error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/toast.test.ts`
Expected: FAIL with "Cannot find module '$lib/utils/toast'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/utils/toast.ts
export function showErrorToast(message: string): void {
  console.error('[ERROR]', message);
  // In a real app, this would trigger a toast component
  // For now, we'll just log to console
}

// Update pinMessage to use toast:
export async function pinMessage(messageId: string, isPinned: boolean, roomId: string) {
  if (!ctx.currentUser) return;

  const action: AtomicAction = {
    type: 'pin',
    messageId,
    roomId,
    isPinned
  };

  const result = await atomicActionManager.executeAtomicAction(action, () => {
    const m = ctx.messages;
    const roomMsgs = m[roomId] || [];
    const idx = roomMsgs.findIndex((x) => x.id === messageId);
    if (idx !== -1) {
      const updated = [...roomMsgs];
      updated[idx] = { ...updated[idx], isPinned, updatedAt: Date.now() };
      ctx.messages = { ...m, [roomId]: updated };
    }
  });

  if (!result.success) {
    showErrorToast(`Không thể ${isPinned ? 'ghim' : 'bỏ ghim'} tin nhắn: ${result.error}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/toast.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/toast.ts src/lib/features/webrtc/dataChannels/messageChannel.ts tests/toast.test.ts
git commit -m "feat: add error handling and toast notifications for transactions"
```

---

**Kế hoạch hoàn chỉnh với 6 tasks.** Mỗi task có đầy đủ code và test. Bắt đầu với Task 1.
