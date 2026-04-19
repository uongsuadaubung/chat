import { describe, it, expect, beforeEach } from 'vitest';
import { ctx } from './webrtc.context.svelte';
import { updatePeerStatus, removePeer } from './peer';

describe('peer store logic', () => {
  beforeEach(() => {
    ctx.peer = [];
  });

  it('adds a new peer with a generated color', () => {
    updatePeerStatus('peer_123', 'Alice', true);
    const peer = ctx.peer;
    expect(peer.length).toBe(1);
    expect(peer[0].id).toBe('peer_123');
    expect(peer[0].name).toBe('Alice');
    expect(peer[0].connected).toBe(true);
    expect(peer[0].color).toBeDefined();
  });

  it('updates an existing peer preserving color', () => {
    updatePeerStatus('peer_123', 'Alice', true);
    const initialColor = ctx.peer[0].color;

    // Thay đổi trạng thái sang offline và đổi tên
    updatePeerStatus('peer_123', 'Alice Updated', false);

    const peer = ctx.peer;
    expect(peer.length).toBe(1);
    expect(peer[0].name).toBe('Alice Updated');
    expect(peer[0].connected).toBe(false);
    expect(peer[0].color).toBe(initialColor);
  });

  it('removes a peer', () => {
    updatePeerStatus('peer_1', 'Bob', true);
    updatePeerStatus('peer_2', 'Charlie', true);

    removePeer('peer_1');
    const peer = ctx.peer;
    expect(peer.length).toBe(1);
    expect(peer[0].id).toBe('peer_2');
  });

  it('sets hasFailed when provided on new peer', () => {
    updatePeerStatus('peer_fail', 'Dave', false, true);
    const peer = ctx.peer.find((p) => p.id === 'peer_fail');
    expect(peer?.hasFailed).toBe(true);
  });

  it('updates hasFailed on existing peer', () => {
    updatePeerStatus('peer_123', 'Alice', true);
    expect(ctx.peer[0].hasFailed).toBe(false);

    updatePeerStatus('peer_123', 'Alice', false, true);
    expect(ctx.peer[0].hasFailed).toBe(true);

    // Recovery: set back to false
    updatePeerStatus('peer_123', 'Alice', true, false);
    expect(ctx.peer[0].hasFailed).toBe(false);
  });

  it('does not overwrite hasFailed when undefined is passed', () => {
    updatePeerStatus('peer_123', 'Alice', true, true);
    // Gọi lại không truyền hasFailed — phải giữ nguyên true
    updatePeerStatus('peer_123', 'Alice', false);
    expect(ctx.peer[0].hasFailed).toBe(true);
  });
});
