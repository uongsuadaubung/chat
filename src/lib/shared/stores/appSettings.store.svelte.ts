import { z } from 'zod';
import { log } from '$lib/core/logger';
import { wakeLockManager } from '$lib/core/wakeLock';

export const SCREEN_SHARE_PROFILES = {
  DETAIL: 'detail',
  MOTION: 'motion'
} as const;

export type ScreenShareProfile = (typeof SCREEN_SHARE_PROFILES)[keyof typeof SCREEN_SHARE_PROFILES];

export const APP_SETTINGS_STORAGE_KEY = 'app_settings';

const appSettingsSchema = z.object({
  screenShareProfile: z.enum([SCREEN_SHARE_PROFILES.DETAIL, SCREEN_SHARE_PROFILES.MOTION]),
  theme: z.enum(['light', 'dark', 'system']).default('light'),
  keepScreenOn: z.boolean().default(false),
  enableGlass: z.boolean().default(false)
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

const defaultSettings: AppSettings = {
  screenShareProfile: SCREEN_SHARE_PROFILES.DETAIL,
  theme: 'light',
  keepScreenOn: false,
  enableGlass: false
};

function getInitialSettings(): AppSettings {
  if (typeof window === 'undefined') return defaultSettings;
  const saved = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const result = appSettingsSchema.safeParse({ ...defaultSettings, ...parsed });
      if (result.success) {
        return result.data;
      }
      return defaultSettings;
    } catch (e: unknown) {
      log.sys.error('Error reading appSettings from LocalStorage:', e);
      return defaultSettings;
    }
  }
  return defaultSettings;
}

class AppSettingsStore {
  settings = $state<AppSettings>(getInitialSettings());
  private hasInitialized = false;

  init() {
    if (typeof window === 'undefined') return;
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    // Legacy migration
    const legacyTheme = localStorage.getItem('theme');
    if (legacyTheme === 'dark' || legacyTheme === 'light') {
      this.settings.theme = legacyTheme;
      localStorage.removeItem('theme');
      this.persist();
    }

    this.applyEffects();
  }

  update(partial: Partial<AppSettings>) {
    const updated = { ...this.settings, ...partial };
    const result = appSettingsSchema.safeParse(updated);

    if (!result.success) {
      log.sys.error('[AppSettings] Invalid update data:', result.error);
      return;
    }

    this.settings = result.data;
    this.persist();
    this.applyEffects();
  }

  private persist() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    }
  }

  private applyEffects() {
    if (typeof window === 'undefined') return;

    // 1. Theme
    if (this.settings.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    // 1.5. Glassmorphism
    if (!this.settings.enableGlass) {
      document.documentElement.setAttribute('data-glass', 'false');
    } else {
      document.documentElement.removeAttribute('data-glass');
    }

    // 2. WakeLock
    wakeLockManager.setEnabled(this.settings.keepScreenOn);
  }
}

export const appSettings = new AppSettingsStore();
