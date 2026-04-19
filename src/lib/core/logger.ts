/**
 * Structured Logger — Thay thế console.log rời rạc bằng logger có prefix + log level.
 * Production chỉ hiện warn/error, development hiện tất cả.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

// Development: hiện tất cả | Production: chỉ warn + error
let currentLevel: LogLevel = import.meta.env?.DEV ? 'debug' : 'warn';

function createLogger(prefix: string) {
  const shouldLog = (level: LogLevel) => LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];

  return {
    debug: (...args: unknown[]) => shouldLog('debug') && console.log(`[${prefix}]`, ...args),
    info: (...args: unknown[]) => shouldLog('info') && console.info(`[${prefix}]`, ...args),
    warn: (...args: unknown[]) => shouldLog('warn') && console.warn(`[${prefix}]`, ...args),
    error: (...args: unknown[]) => shouldLog('error') && console.error(`[${prefix}]`, ...args)
  };
}

export const log = {
  ice: createLogger('ICE'),
  signal: createLogger('Signal'),
  webrtc: createLogger('WebRTC'),
  dc: createLogger('DataChannel'),
  negotiation: createLogger('Negotiation'),
  glare: createLogger('Glare'),
  room: createLogger('Room'),
  sys: createLogger('System'),
  db: createLogger('DB'),
  transaction: createLogger('Transaction')
};

/** Thay đổi log level lúc runtime (dùng trong console DevTools) */
export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}
