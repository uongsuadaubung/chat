import { describe, it, expect, beforeEach } from 'vitest';
import { ctx } from './webrtc.context.svelte';
import { webrtc } from './webrtc.store.svelte';
import type { ChatMessage } from '$lib/type';

describe('webrtc.store.svelte — markAsRead', () => {
  beforeEach(() => {
    ctx.messages = {};
  });

  it('marks unread messages from a specific sender as read', () => {
    ctx.messages = {
      peer_1: [
        {
          id: 'msg_1',
          senderId: 'peer_1',
          senderName: 'Alice',
          peerId: 'peer_1',
          timestamp: 100,
          isSelf: false,
          type: 'text',
          text: 'Hello',
          read: false
        },
        {
          id: 'msg_2',
          senderId: 'peer_1',
          senderName: 'Alice',
          peerId: 'peer_1',
          timestamp: 200,
          isSelf: false,
          type: 'text',
          text: 'Hi again',
          read: false
        }
      ] as ChatMessage[]
    };

    webrtc.markAsRead('peer_1');

    const messages = ctx.messages;
    expect(messages['peer_1'][0].read).toBe(true);
    expect(messages['peer_1'][1].read).toBe(true);
  });

  it('does not modify isSelf messages', () => {
    ctx.messages = {
      peer_1: [
        {
          id: 'msg_1',
          senderId: 'me',
          senderName: 'Me',
          timestamp: 100,
          isSelf: true,
          type: 'text',
          text: 'My msg',
          read: false
        }
      ] as ChatMessage[]
    };

    webrtc.markAsRead('peer_1');

    const messages = ctx.messages;
    // isSelf messages không bị đánh dấu read
    expect(messages['peer_1'][0].read).toBe(false);
  });

  it('does not mutate state if all messages are already read', () => {
    const original: ChatMessage[] = [
      {
        id: 'msg_1',
        senderId: 'peer_1',
        senderName: 'Alice',
        peerId: 'peer_1',
        timestamp: 100,
        isSelf: false,
        type: 'text',
        text: 'Hello',
        read: true
      }
    ];
    ctx.messages = { peer_1: original };

    webrtc.markAsRead('peer_1');

    const messages = ctx.messages;
    // Phải trả về cùng reference (unchanged) do optimization
    expect(messages['peer_1']).toBe(original);
  });

  it('handles non-existent peer gracefully', () => {
    ctx.messages = {};
    // Không throw
    expect(() => webrtc.markAsRead('nonexistent_peer')).not.toThrow();
  });

  it('produces a new array reference when changes occur (Svelte reactivity)', () => {
    const original: ChatMessage[] = [
      {
        id: 'msg_1',
        senderId: 'peer_1',
        senderName: 'Alice',
        peerId: 'peer_1',
        timestamp: 100,
        isSelf: false,
        type: 'text',
        text: 'Hello',
        read: false
      }
    ];
    ctx.messages = { peer_1: original };

    webrtc.markAsRead('peer_1');

    const messages = ctx.messages;
    // Phải tạo reference mới để Svelte 5 reactivity detect được
    expect(messages['peer_1']).not.toBe(original);
  });
});
