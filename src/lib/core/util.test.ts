import { describe, it, expect } from 'vitest';
import { isValidSignal, isPolite, shouldInitiate, formatFileSize, formatTime } from './util';

describe('isValidSignal', () => {
  it('returns true for a valid offer signal', () => {
    expect(
      isValidSignal({ senderId: 'abc', timestamp: 123, type: 'offer', sdp: { type: 'offer' } })
    ).toBe(true);
  });

  it('returns true for a valid answer signal', () => {
    expect(
      isValidSignal({ senderId: 'abc', timestamp: 123, type: 'answer', sdp: { type: 'answer' } })
    ).toBe(true);
  });

  it('returns true for a valid candidate signal', () => {
    expect(
      isValidSignal({
        senderId: 'abc',
        timestamp: 123,
        type: 'candidate',
        candidate: { candidate: 'candidate...' }
      })
    ).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(isValidSignal(null)).toBe(false);
    expect(isValidSignal(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isValidSignal('hello')).toBe(false);
    expect(isValidSignal(42)).toBe(false);
  });

  it('returns false when senderId is missing', () => {
    expect(isValidSignal({ timestamp: 123, type: 'offer' })).toBe(false);
  });

  it('returns false when timestamp is not a number', () => {
    expect(isValidSignal({ senderId: 'abc', timestamp: 'not-a-number', type: 'offer' })).toBe(
      false
    );
  });

  it('returns false for unknown type', () => {
    expect(isValidSignal({ senderId: 'abc', timestamp: 123, type: 'unknown' })).toBe(false);
  });
});

describe('isPolite', () => {
  it('returns true when myId > peerId (polite peer yields)', () => {
    expect(isPolite('z_user', 'a_user')).toBe(true);
  });

  it('returns false when myId < peerId (impolite peer keeps offer)', () => {
    expect(isPolite('a_user', 'z_user')).toBe(false);
  });

  it('returns false when IDs are equal', () => {
    expect(isPolite('same', 'same')).toBe(false);
  });
});

describe('shouldInitiate', () => {
  it('returns true when myId < peerId (smaller ID initiates)', () => {
    expect(shouldInitiate('a_user', 'z_user')).toBe(true);
  });

  it('returns false when myId > peerId', () => {
    expect(shouldInitiate('z_user', 'a_user')).toBe(false);
  });

  it('isPolite and shouldInitiate are mutually exclusive', () => {
    // Quan trọng: một peer không thể vừa polite vừa initiator
    const myId = 'alice';
    const peerId = 'bob';
    expect(isPolite(myId, peerId)).not.toBe(shouldInitiate(myId, peerId));
  });
});

describe('formatFileSize', () => {
  it('returns "0 Bytes" for 0', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('returns "0 Bytes" for negative values', () => {
    expect(formatFileSize(-1)).toBe('0 Bytes');
    expect(formatFileSize(-999)).toBe('0 Bytes');
  });

  it('formats bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
  });

  it('formats kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes correctly', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('formats gigabytes correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
  });

  it('formats terabytes correctly', () => {
    expect(formatFileSize(1099511627776)).toBe('1 TB');
  });
});

describe('formatTime', () => {
  it('returns "0s" for 0', () => {
    expect(formatTime(0)).toBe('0s');
  });

  it('returns "0s" for negative values', () => {
    expect(formatTime(-5)).toBe('0s');
  });

  it('returns "0s" for Infinity', () => {
    expect(formatTime(Infinity)).toBe('0s');
  });

  it('returns "0s" for NaN', () => {
    expect(formatTime(NaN)).toBe('0s');
  });

  it('formats seconds only', () => {
    expect(formatTime(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(125)).toBe('2m 5s');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatTime(3661)).toBe('1h 1m 1s');
  });

  it('shows 0m when hours > 0 but minutes = 0', () => {
    expect(formatTime(3600)).toBe('1h 0m 0s');
  });

  it('handles fractional seconds by flooring', () => {
    expect(formatTime(2.9)).toBe('2s');
  });
});
