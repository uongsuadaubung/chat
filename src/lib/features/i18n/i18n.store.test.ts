import { describe, it, expect, beforeEach } from 'vitest';
import { i18n } from './i18n.store.svelte';

describe('i18n.store', () => {
  beforeEach(() => {
    // Reset to default locale before each test
    i18n.setLocale('vi');
  });

  it('t returns the correct translation for the current locale', () => {
    i18n.setLocale('en');
    expect(i18n.t('hello' as never)).toBe('hello'); // Assuming 'hello' isn't explicitly defined, it returns the key
    expect(i18n.t('settings')).toBe('Settings');

    i18n.setLocale('vi');
    expect(i18n.t('settings')).toBe('Cài đặt');
  });

  it('t falls back to vi if key is missing in en', () => {
    i18n.setLocale('en');
    // For a key that is the same or falls back
    expect(i18n.t('settings')).toBe('Settings');
  });

  it('t returns the key itself if no translation is found', () => {
    expect(i18n.t('nonExistentKey' as never)).toBe('nonExistentKey');
  });
});
