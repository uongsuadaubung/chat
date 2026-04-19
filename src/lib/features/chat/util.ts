import type { ChatMessage } from '$lib/type';
import { i18n } from '$lib/features/i18n/i18n.store.svelte';

export function getFileCategory(mimeType?: string): 'image' | 'video' | 'audio' | 'file' {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function isImageMessage(msg?: ChatMessage | null): boolean {
  return msg?.type === 'file' && getFileCategory(msg.file?.mimeType) === 'image';
}

export function isVideoMessage(msg?: ChatMessage | null): boolean {
  return msg?.type === 'file' && getFileCategory(msg.file?.mimeType) === 'video';
}

export function isAudioMessage(msg?: ChatMessage | null): boolean {
  return msg?.type === 'file' && getFileCategory(msg.file?.mimeType) === 'audio';
}

export function isMediaMessage(msg?: ChatMessage | null): boolean {
  return isImageMessage(msg) || isVideoMessage(msg) || isAudioMessage(msg);
}

export function getMessagePreviewText(msg?: ChatMessage | null): string {
  if (!msg) return '';
  if (msg.type === 'file' || msg.file) {
    const cat = getFileCategory(msg.file?.mimeType);
    switch (cat) {
      case 'image':
        return i18n.t('attachmentImage');
      case 'video':
        return i18n.t('attachmentVideo');
      case 'audio':
        return i18n.t('attachmentAudio');
      default:
        return i18n.t('attachmentFile');
    }
  }
  if (msg.text) {
    return msg.text.length > 50 ? msg.text.substring(0, 50) + '...' : msg.text;
  }
  return '';
}
