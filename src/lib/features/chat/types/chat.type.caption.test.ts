import { describe, it, expect } from 'vitest';
import { FileTransferMetaSchema } from './chat.type';

// Base object đủ field bắt buộc
const baseMeta = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  senderId: 'sender_1',
  name: 'paste_image.png',
  size: 102400,
  mimeType: 'image/png',
  totalChunks: 2
};

describe('FileTransferMetaSchema — caption field', () => {
  it('accepts meta with caption string', () => {
    const result = FileTransferMetaSchema.safeParse({ ...baseMeta, caption: 'Hello world' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.caption).toBe('Hello world');
    }
  });

  it('accepts meta without caption (optional field)', () => {
    const result = FileTransferMetaSchema.safeParse(baseMeta);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.caption).toBeUndefined();
    }
  });

  it('accepts meta with empty string caption', () => {
    const result = FileTransferMetaSchema.safeParse({ ...baseMeta, caption: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.caption).toBe('');
    }
  });

  it('rejects caption that is not a string', () => {
    const result = FileTransferMetaSchema.safeParse({ ...baseMeta, caption: 42 });
    expect(result.success).toBe(false);
  });

  it('rejects caption that is null', () => {
    const result = FileTransferMetaSchema.safeParse({ ...baseMeta, caption: null });
    expect(result.success).toBe(false);
  });
});
