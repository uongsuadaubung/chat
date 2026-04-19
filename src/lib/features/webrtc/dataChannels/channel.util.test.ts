import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ctx } from '../webrtc.context.svelte';
import { sendToPeer } from './channel.util';
import type { DataChannelPayload } from '$lib/type';

function createMockChannel(readyState: string = 'open') {
  return {
    readyState,
    send: vi.fn(),
    bufferedAmount: 0
  } as unknown as RTCDataChannel;
}

describe('channel.util', () => {
  beforeEach(() => {
    ctx.dataChannels.clear();
  });

  describe('sendToPeer', () => {
    it('sends JSON payload to the correct peer', () => {
      const channel = createMockChannel('open');
      ctx.dataChannels.set('peer_1', channel);

      const payload: DataChannelPayload = {
        type: 'chat',
        peerId: 'peer_1',
        message: {
          id: 'msg_1',
          senderId: 'me',
          senderName: 'Me',
          peerId: 'peer_1',
          timestamp: Date.now(),
          isSelf: true,
          type: 'text',
          text: 'Hello'
        }
      };
      sendToPeer('peer_1', payload);

      expect(channel.send).toHaveBeenCalledOnce();
      const sent = JSON.parse((channel.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(sent.type).toBe('chat');
      expect(sent.message.text).toBe('Hello');
    });

    it('does not send if channel is not open', () => {
      const channel = createMockChannel('connecting');
      ctx.dataChannels.set('peer_1', channel);

      sendToPeer('peer_1', { type: 'typing', peerId: 'peer_1', isTyping: true });

      expect(channel.send).not.toHaveBeenCalled();
    });

    it('does not throw if peer does not exist', () => {
      expect(() =>
        sendToPeer('nonexistent', { type: 'typing', peerId: 'peer_1', isTyping: true })
      ).not.toThrow();
    });
  });
});
