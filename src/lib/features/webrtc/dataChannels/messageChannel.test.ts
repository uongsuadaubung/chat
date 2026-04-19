import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SvelteMap } from 'svelte/reactivity';
import { ctx } from '../webrtc.context.svelte';
import {
  addMessage,
  addMessagesBatch,
  deleteMessage,
  editMessage,
  reactMessage,
  fileIndex
} from './messageChannel';
import type { ChatMessage } from '$lib/type';
import type { OutgoingFile } from '$lib/features/webrtc/types/webrtc.type';

// sendToPeer gọi DataChannel — mock để không throw trong unit tests
vi.mock('$lib/features/webrtc/dataChannels/channel.util', () => ({
  sendToPeer: vi.fn()
}));

// Mock atomicActionManager: chạy luôn optimistic update callback, trả thành công
// Tránh floating promise từ DB writes rò rỉ qua test teardown
vi.mock('$lib/features/webrtc/atomicActionManager', () => ({
  atomicActionManager: {
    executeAtomicAction: vi
      .fn()
      .mockImplementation(async (_action: unknown, uiUpdateCallback?: () => void) => {
        uiUpdateCallback?.();
        return { success: true };
      })
  }
}));

vi.mock('$lib/shared/stores/toast.store.svelte', () => ({
  toast: { error: vi.fn() }
}));

describe('messageChannel', () => {
  beforeEach(() => {
    // Reset stores
    ctx.messages = {};
    ctx.typingUsers = new SvelteMap();
    ctx.outgoingFiles.clear();
    ctx.incomingFiles.clear();
    ctx.dataChannels.clear();
    // Giả lập mình là user có id 'me_123'
    ctx.currentUser = { id: 'me_123', name: 'Me' };
  });

  it('adds a single message correctly', async () => {
    const msg: ChatMessage = {
      id: 'msg_1',
      senderId: 'peer_1',
      senderName: 'Peer',
      peerId: 'peer_1',
      timestamp: Date.now(),
      isSelf: false,
      type: 'text',
      text: 'Hello'
    };
    await addMessage(msg);
    const messagesObj = ctx.messages;
    const messages = messagesObj['peer_1'] || [];
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe('msg_1');
  });

  it('addMessagesBatch merges messages and recalculates isSelf correctly', async () => {
    const batch: ChatMessage[] = [
      {
        id: 'msg_1',
        senderId: 'peer_1', // Người đứng từ phía Peer gửi (Remote)
        senderName: 'Peer',
        peerId: 'peer_1',
        timestamp: 100,
        isSelf: true, // Peer coi tin này là 'self'
        type: 'text',
        text: 'Hi from Peer'
      },
      {
        id: 'msg_2',
        senderId: 'me_123', // Tin này do chúng ta (Me) gửi từ trước
        senderName: 'Me',
        peerId: 'peer_1',
        timestamp: 200,
        isSelf: false, // Từ góc nhìn cùa Peer, tin này KHÔNG từ chính họ
        type: 'text',
        text: 'Hi from Me'
      }
    ];

    await addMessagesBatch(batch);

    const messagesObj = ctx.messages;
    // msg_1 goes to peer_1 room
    const messages = messagesObj['peer_1'] || [];
    expect(messages.length).toBe(2);

    // Kết quả sau khi Merge vào máy mình (currentUser.id = me_123)
    // msg_1 từ 'peer_1' phải được đảo ngược thành isSelf = false (Nhận)
    expect(messages[0].id).toBe('msg_1');
    expect(messages[0].isSelf).toBe(false);

    // msg_2 từ mình phải được render với isSelf = true (Gửi)
    expect(messages[1].id).toBe('msg_2');
    expect(messages[1].isSelf).toBe(true);
  });

  it('addMessagesBatch respects existing blob URLs over sync payloads', async () => {
    // Add existing local message with loaded URL
    ctx.messages = {
      peer_1: [
        {
          id: 'file_1',
          senderId: 'peer_1',
          senderName: 'Peer',
          peerId: 'peer_1',
          timestamp: 100,
          isSelf: false,
          type: 'file',
          file: {
            name: 'test.png',
            size: 1000,
            mimeType: 'image/png',
            url: 'blob:http://localhost/cached',
            progress: 100
          }
        }
      ]
    };

    // Nận được dữ liệu đồng bộ chồng chéo (từ sync_data, thường thiếu blob)
    const batch: ChatMessage[] = [
      {
        id: 'file_1',
        senderId: 'peer_1',
        senderName: 'Peer',
        peerId: 'peer_1',
        timestamp: 100,
        isSelf: false,
        type: 'file',
        file: {
          name: 'test.png',
          size: 1000,
          mimeType: 'image/png'
        }
      }
    ];

    await addMessagesBatch(batch);
    const messagesObj = ctx.messages;
    const messages = messagesObj['peer_1'] || [];
    expect(messages.length).toBe(1);

    // Thử nghiệm UI Svelte phải lưu lại file cũ để tránh render lỗi broken image nếu đã có URL
    expect(messages[0].file?.url).toBe('blob:http://localhost/cached');
    expect(messages[0].file?.progress).toBe(100);
  });
});

// ---------------------------------------------------------------------------

describe('messageChannel — addMessage', () => {
  beforeEach(() => {
    ctx.messages = {};
    ctx.currentUser = { id: 'me_123', name: 'Me' };
    fileIndex.clear();
  });

  it('updates an existing message by id instead of duplicating it', async () => {
    const msg: ChatMessage = {
      id: 'msg_dup',
      senderId: 'peer_1',
      senderName: 'Peer',
      peerId: 'peer_1',
      timestamp: 100,
      isSelf: false,
      type: 'text',
      text: 'original'
    };
    await addMessage(msg);
    await addMessage({ ...msg, text: 'updated' });

    const messages = ctx.messages['peer_1'] || [];
    expect(messages.length).toBe(1);
    expect(messages[0].text).toBe('updated');
  });

  it('registers file messages into fileIndex for O(1) lookup', async () => {
    fileIndex.clear();
    const msg: ChatMessage = {
      id: 'file_001',
      senderId: 'peer_1',
      senderName: 'Peer',
      peerId: 'peer_1',
      timestamp: 100,
      isSelf: false,
      type: 'file',
      file: { name: 'img.png', size: 100, mimeType: 'image/png' }
    };
    await addMessage(msg);
    expect(fileIndex.get('file_001')).toBe('peer_1');
  });

  it('trims messages exceeding MAX_MESSAGE_HISTORY and cleans up outgoingFiles memory', async () => {
    const { MAX_MESSAGE_HISTORY } = await import('$lib/features/chat/constants/chat.constant');

    // Add an old file message that will be pushed out of history
    await addMessage({
      id: 'file_old',
      senderId: 'peer_1',
      senderName: 'Peer',
      peerId: 'peer_1',
      timestamp: 0,
      isSelf: false,
      type: 'file',
      file: { name: 'old.png', size: 100, mimeType: 'image/png' }
    });
    // Giả lập file vẫn được lưu trong RAM để send WebRTC
    ctx.outgoingFiles.set('file_old', {} as OutgoingFile);

    for (let i = 1; i <= MAX_MESSAGE_HISTORY; i++) {
      await addMessage({
        id: `msg_${i}`,
        senderId: 'peer_1',
        senderName: 'Peer',
        peerId: 'peer_1',
        timestamp: i,
        isSelf: false,
        type: 'text',
        text: `Message ${i}`
      });
    }
    const messages = ctx.messages['peer_1'] || [];
    expect(messages.length).toBe(MAX_MESSAGE_HISTORY);
    // Phải giữ lại tin nhắn mới nhất (slice từ cuối)
    expect(messages[messages.length - 1].id).toBe(`msg_${MAX_MESSAGE_HISTORY}`);

    // Đảm bảo memory của WebRTC file transmission bị dọn rác đúng khi message bay khỏi history
    // Test này chặn Regression: Không được cho AI/dev dọn RAM file ở bên `peerConnection` lúc disconnect
    // vì làm vậy sẽ gây lỗi F5 không tải lại được hình. GC memory phải thực hiện tại đây.
    expect(ctx.outgoingFiles.has('file_old')).toBe(false);
    expect(fileIndex.has('file_old')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('messageChannel — deleteMessage', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [
        {
          id: 'msg_del',
          senderId: 'peer_1',
          senderName: 'Peer',
          peerId: 'peer_1',
          timestamp: 100,
          isSelf: false,
          type: 'text',
          text: 'delete me'
        },
        {
          id: 'file_del',
          senderId: 'peer_1',
          senderName: 'Peer',
          peerId: 'peer_1',
          timestamp: 200,
          isSelf: false,
          type: 'file',
          file: { name: 'doc.pdf', size: 500, mimeType: 'application/pdf' }
        }
      ] as ChatMessage[]
    };
    fileIndex.set('file_del', 'peer_1');
    ctx.currentUser = { id: 'me_123', name: 'Me' };
  });

  it('marks message as deleted globally (isDeleted=true, clears file/text)', async () => {
    await deleteMessage('msg_del', 'peer_1', true);
    const msg = ctx.messages['peer_1']?.find((m) => m.id === 'msg_del');
    expect(msg?.isDeleted).toBe(true);
    expect(msg?.text).toBeUndefined();
  });

  it('removes fileIndex and outgoingFiles entry when a file message is deleted', async () => {
    ctx.outgoingFiles.set('file_del', {} as OutgoingFile); // Giả lập trong RAM
    await deleteMessage('file_del', 'peer_1', true);

    expect(fileIndex.has('file_del')).toBe(false);
    // Chặn Regression: Việc xoá RAM của WebRTC stream phải diễn ra khi xoá Message,
    // không được xoá tuỳ tiện ở peerConnection để phòng F5 browser.
    expect(ctx.outgoingFiles.has('file_del')).toBe(false);
  });

  it('hides message locally (adds to hiddenFromPeers) instead of deleting', async () => {
    await deleteMessage('msg_del', 'peer_1', false);
    const msg = ctx.messages['peer_1']?.find((m) => m.id === 'msg_del');
    expect(msg?.isDeleted).toBeUndefined();
    expect(msg?.hiddenFromPeers).toContain('me_123');
  });

  it('does nothing when roomId has no messages', async () => {
    await expect(deleteMessage('msg_del', 'nonexistent_room', true)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe('messageChannel — editMessage', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [
        {
          id: 'msg_edit',
          senderId: 'me_123',
          senderName: 'Me',
          peerId: 'peer_1',
          timestamp: 100,
          isSelf: true,
          type: 'text',
          text: 'original text'
        }
      ] as ChatMessage[]
    };
    ctx.currentUser = { id: 'me_123', name: 'Me' };
  });

  it('updates text and sets isEdited=true', async () => {
    await editMessage('msg_edit', 'new text', 'peer_1');
    const msg = ctx.messages['peer_1']?.find((m) => m.id === 'msg_edit');
    expect(msg?.text).toBe('new text');
    expect(msg?.isEdited).toBe(true);
  });

  it('does not modify state when messageId is not found', async () => {
    const before = ctx.messages['peer_1']?.[0].text;
    await editMessage('nonexistent', 'new text', 'peer_1');
    expect(ctx.messages['peer_1']?.[0].text).toBe(before);
  });
});

// ---------------------------------------------------------------------------

describe('messageChannel — reactMessage', () => {
  beforeEach(() => {
    ctx.messages = {
      peer_1: [
        {
          id: 'msg_react',
          senderId: 'peer_1',
          senderName: 'Peer',
          peerId: 'peer_1',
          timestamp: 100,
          isSelf: false,
          type: 'text',
          text: 'React to me'
        }
      ] as ChatMessage[]
    };
    ctx.currentUser = { id: 'me_123', name: 'Me' };
  });

  it('adds a reaction from current user', async () => {
    await reactMessage('msg_react', '👍', 'peer_1');
    const msg = ctx.messages['peer_1']?.[0];
    expect(msg?.reactions?.['me_123']).toBe('👍');
  });

  it('toggles off the same reaction (second tap removes it)', async () => {
    await reactMessage('msg_react', '👍', 'peer_1');
    await reactMessage('msg_react', '👍', 'peer_1'); // same emoji → toggle off
    const msg = ctx.messages['peer_1']?.[0];
    expect(msg?.reactions?.['me_123']).toBeUndefined();
  });

  it('switches to a different reaction', async () => {
    await reactMessage('msg_react', '👍', 'peer_1');
    await reactMessage('msg_react', '❤️', 'peer_1'); // different emoji → replace
    const msg = ctx.messages['peer_1']?.[0];
    expect(msg?.reactions?.['me_123']).toBe('❤️');
  });

  it('removes reaction when empty string is passed', async () => {
    await reactMessage('msg_react', '👍', 'peer_1');
    await reactMessage('msg_react', '', 'peer_1'); // empty → remove
    const msg = ctx.messages['peer_1']?.[0];
    expect(msg?.reactions?.['me_123']).toBeUndefined();
  });
});
