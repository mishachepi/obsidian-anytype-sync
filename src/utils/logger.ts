export class Logger {
  private logLevel: 'error' | 'info' | 'debug';
  
  constructor(logLevel: 'error' | 'info' | 'debug' = 'info') {
    this.logLevel = logLevel;
  }

  setLogLevel(level: 'error' | 'info' | 'debug') {
    this.logLevel = level;
  }

  error(message: string, ...args: any[]) {
    console.error(`[Anytype Sync] ERROR: ${message}`, ...args);
  }

  info(message: string, ...args: any[]) {
    if (this.logLevel === 'debug' || this.logLevel === 'info') {
      console.info(`[Anytype Sync] INFO: ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]) {
    if (this.logLevel === 'debug') {
      console.log(`[Anytype Sync] DEBUG: ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.logLevel === 'debug' || this.logLevel === 'info') {
      console.warn(`[Anytype Sync] WARN: ${message}`, ...args);
    }
  }

  // Performance timing utilities
  time(label: string) {
    if (this.logLevel === 'debug') {
      console.time(`[Anytype Sync] TIMER: ${label}`);
    }
  }

  timeEnd(label: string) {
    if (this.logLevel === 'debug') {
      console.timeEnd(`[Anytype Sync] TIMER: ${label}`);
    }
  }
}