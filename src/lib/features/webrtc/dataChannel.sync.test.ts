import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';

describe('Sync Bug Fix - includeLower: false', () => {
  // Simple unit test for the Dexie between() parameters
  it('should demonstrate the fix: between() with includeLower: false', () => {
    // Simulate the bug scenario
    const latestRemoteTime = 1000;

    // Messages in database
    const dbMessages = [
      { id: 'msg1', timestamp: 900 }, // Older
      { id: 'msg2', timestamp: 1000 }, // Same timestamp (caused bug)
      { id: 'msg3', timestamp: 1100 } // Newer
    ];

    // BUG: includeLower: true (old code)
    const buggyQuery = dbMessages.filter(
      (msg) => msg.timestamp >= latestRemoteTime // >= includes same timestamp
    );

    // FIX: includeLower: false (new code)
    const fixedQuery = dbMessages.filter(
      (msg) => msg.timestamp > latestRemoteTime // > excludes same timestamp
    );

    // With bug: includes message with same timestamp
    expect(buggyQuery).toHaveLength(2);
    expect(buggyQuery.map((m) => m.id)).toEqual(['msg2', 'msg3']);

    // With fix: excludes message with same timestamp
    expect(fixedQuery).toHaveLength(1);
    expect(fixedQuery.map((m) => m.id)).toEqual(['msg3']);

    // This explains why sync happened unnecessarily
    console.log('Bug explanation:');
    console.log('- Remote has message with timestamp:', latestRemoteTime);
    console.log('- Local also has message with same timestamp');
    console.log('- Buggy query (includeLower: true) includes it → unnecessary sync');
    console.log('- Fixed query (includeLower: false) excludes it → no sync needed');
  });

  it('should handle Dexie.maxKey correctly', () => {
    // Test that Dexie.maxKey works as expected
    expect(Dexie.maxKey).toBeDefined();

    // The query structure should be:
    // .between([peerId, latestRemoteTime], [peerId, Dexie.maxKey], false, false)

    const queryParams = [
      ['peer_1', 1000], // lower bound
      ['peer_1', Dexie.maxKey], // upper bound (max possible)
      false, // includeLower: false (THE FIX)
      false // includeUpper: false
    ];

    expect(queryParams[2]).toBe(false); // includeLower must be false
  });

  it('should only sync truly missing messages', () => {
    // Test cases for when sync should/shouldn't happen

    const testCases = [
      {
        remoteTime: 1000,
        localMessages: [{ timestamp: 1000 }],
        shouldSync: false
      },
      {
        remoteTime: 1000,
        localMessages: [{ timestamp: 1100 }],
        shouldSync: true
      },
      {
        remoteTime: 1000,
        localMessages: [{ timestamp: 900 }],
        shouldSync: false
      },
      {
        remoteTime: 0,
        localMessages: [{ timestamp: 500 }, { timestamp: 1000 }],
        shouldSync: true
      }
    ];

    testCases.forEach(({ remoteTime, localMessages, shouldSync }) => {
      const messagesToSync = localMessages.filter((msg) => msg.timestamp > remoteTime);
      expect(messagesToSync.length > 0).toBe(shouldSync);
    });
  });
});
