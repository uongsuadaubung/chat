import { log } from '$lib/core/logger';

export class WakeLockManager {
  private wakeLock: WakeLockSentinel | null = null;
  private isEnabled = false;

  constructor() {
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', async () => {
        if (this.isEnabled && document.visibilityState === 'visible') {
          await this.request();
        }
      });
    }
  }

  private async request() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        log.sys.error('Wake Lock request failed:', err);
      }
    } else {
      log.sys.warn('Wake Lock API not supported');
    }
  }

  private async release() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch (e: unknown) {
        log.sys.warn('Wake Lock release failed:', e);
      }
      this.wakeLock = null;
    }
  }

  public async setEnabled(enabled: boolean) {
    this.isEnabled = enabled;

    if (enabled && document.visibilityState === 'visible') {
      await this.request();
    } else if (!enabled) {
      await this.release();
    }
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }
}

export const wakeLockManager = new WakeLockManager();
