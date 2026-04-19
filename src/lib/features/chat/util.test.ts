import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '$lib/type';
import {
  getFileCategory,
  isImageMessage,
  isVideoMessage,
  isAudioMessage,
  isMediaMessage
} from './util';

describe('chat utils: getFileCategory()', () => {
  it('returns "file" for undefined or empty mimeType', () => {
    expect(getFileCategory()).toBe('file');
    expect(getFileCategory('')).toBe('file');
  });

  it('correctly categorizes images', () => {
    expect(getFileCategory('image/png')).toBe('image');
    expect(getFileCategory('image/jpeg')).toBe('image');
    expect(getFileCategory('image/gif')).toBe('image');
  });

  it('correctly categorizes videos', () => {
    expect(getFileCategory('video/mp4')).toBe('video');
    expect(getFileCategory('video/webm')).toBe('video');
  });

  it('correctly categorizes audio', () => {
    expect(getFileCategory('audio/mpeg')).toBe('audio');
    expect(getFileCategory('audio/webm')).toBe('audio');
    expect(getFileCategory('audio/ogg')).toBe('audio');
  });

  it('defaults to "file" for other mimeTypes', () => {
    expect(getFileCategory('application/pdf')).toBe('file');
    expect(getFileCategory('application/zip')).toBe('file');
    expect(getFileCategory('text/plain')).toBe('file');
    expect(getFileCategory('application/octet-stream')).toBe('file');
  });
});

describe('chat utils: type checkers', () => {
  const createMockMessage = (type: string, mimeType?: string) =>
    ({
      id: '1',
      text: '',
      senderId: 'me',
      senderName: 'Me',
      timestamp: Date.now(),
      type,
      file: mimeType ? { name: 'test', size: 100, mimeType, data: new ArrayBuffer(0) } : undefined,
      read: false,
      isSelf: true,
      reactions: {}
    }) as ChatMessage;

  it('isImageMessage()', () => {
    expect(isImageMessage(createMockMessage('file', 'image/png'))).toBe(true);
    expect(isImageMessage(createMockMessage('file', 'video/mp4'))).toBe(false);
    expect(isImageMessage(createMockMessage('text'))).toBe(false);
    expect(isImageMessage(undefined)).toBe(false);
    expect(isImageMessage(null)).toBe(false);
  });

  it('isVideoMessage()', () => {
    expect(isVideoMessage(createMockMessage('file', 'video/mp4'))).toBe(true);
    expect(isVideoMessage(createMockMessage('file', 'image/png'))).toBe(false);
    expect(isVideoMessage(createMockMessage('text'))).toBe(false);
  });

  it('isAudioMessage()', () => {
    expect(isAudioMessage(createMockMessage('file', 'audio/webm'))).toBe(true);
    expect(isAudioMessage(createMockMessage('file', 'video/mp4'))).toBe(false);
    expect(isAudioMessage(createMockMessage('text'))).toBe(false);
  });

  it('isMediaMessage()', () => {
    expect(isMediaMessage(createMockMessage('file', 'audio/webm'))).toBe(true);
    expect(isMediaMessage(createMockMessage('file', 'video/mp4'))).toBe(true);
    expect(isMediaMessage(createMockMessage('file', 'image/png'))).toBe(true);
    expect(isMediaMessage(createMockMessage('file', 'application/pdf'))).toBe(false);
    expect(isMediaMessage(createMockMessage('text'))).toBe(false);
  });
});
