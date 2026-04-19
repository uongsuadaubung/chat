function generateFallbackUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class AuthStore {
  username = $state('');
  sessionId = $state('');

  // Svelte 5 rune derived getter
  get user() {
    return this.username ? { id: this.sessionId, name: this.username } : null;
  }

  constructor() {
    this.init();
  }

  init() {
    if (typeof localStorage === 'undefined') {
      this.sessionId = generateFallbackUUID();
      return;
    }

    this.username = localStorage.getItem('username') || '';

    let storedSession = localStorage.getItem('sessionId') || '';
    if (!storedSession) {
      storedSession =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : generateFallbackUUID();
      localStorage.setItem('sessionId', storedSession);
    }
    this.sessionId = storedSession;
  }

  setUsername(name: string) {
    this.username = name;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('username', name);
    }
  }
}

export const authStore = new AuthStore();
