import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { IncomingFile, OutgoingFile } from './types/webrtc.type';
import { ctx } from './webrtc.context.svelte';
import { leaveRoom } from './room';
import { remove, get } from '$lib/core/firebase';

vi.mock('$lib/core/firebase', () => ({
  db: {},
  ref: vi.fn((_db, path) => path),
  set: vi.fn(),
  get: vi.fn(),
  onChildAdded: vi.fn(),
  onChildRemoved: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
  onDisconnect: vi.fn().mockReturnValue({ remove: vi.fn() })
}));

vi.mock('$lib/core/logger', () => ({
  log: {
    room: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    signal: { warn: vi.fn(), info: vi.fn() }
  }
}));

// prevent indexing components that depend on these functions
vi.mock('$lib/features/webrtc/peerConnection', () => ({
  setupPeerConnection: vi.fn(),
  cleanupPeer: vi.fn()
}));

vi.mock('$lib/features/webrtc/dataChannels/messageChannel', () => ({
  loadAllHistoryFromDB: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/features/webrtc/peer', () => ({
  updatePeerStatus: vi.fn()
}));

vi.mock('$lib/features/webrtc/signaling', () => ({
  handleSignal: vi.fn()
}));

describe('room — leaveRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.currentRoomId = 'test_room';
    ctx.currentUser = { id: 'user_1', name: 'User 1' };
    ctx.signalPath = 'signals/test_room';

    // Giả lập unsubscribes
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    ctx.unsubscribes.push(unsub1, unsub2);

    // Giả lập state
    ctx.incomingFiles.set('file1', {} as IncomingFile);
    ctx.outgoingFiles.set('file2', {} as OutgoingFile);

    const mockConnection = { close: vi.fn() } as unknown as RTCPeerConnection;
    ctx.connections.set('peer1', mockConnection);
    ctx.dataChannels.set('peer1', {} as RTCDataChannel);
  });

  it('resets context state and clears connections, files, and listeners', async () => {
    (get as Mock).mockResolvedValue({ exists: () => true });

    await leaveRoom();

    expect(ctx.currentRoomId).toBeNull();
    expect(ctx.currentUser).toBeNull();
    expect(ctx.signalPath).toBeNull();

    expect(ctx.unsubscribes.length).toBe(0);
    expect(ctx.incomingFiles.size).toBe(0);
    expect(ctx.outgoingFiles.size).toBe(0);
    expect(ctx.connections.size).toBe(0);
    expect(ctx.dataChannels.size).toBe(0);
    expect(ctx.messages).toEqual({});
    expect(ctx.peer).toEqual([]);

    expect(remove).toHaveBeenCalledWith('rooms/test_room/users/user_1');
    expect(remove).toHaveBeenCalledWith('signals/test_room/user_1');
  });

  it('cleans up room branch if the room is empty', async () => {
    (get as Mock).mockResolvedValue({ exists: () => false }); // root not exists -> empty

    await leaveRoom();

    expect(remove).toHaveBeenCalledWith('rooms/test_room');
  });
});
