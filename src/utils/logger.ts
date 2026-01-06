/**
 * Logger Utility
 * Simple logging utility for the MCP server
 * Logs to stderr to avoid interfering with MCP stdio communication
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel = 'info';

  /**
   * Initialize logger with level from environment
   */
  initialize(): void {
    const envLevel = process.env['LOG_LEVEL']?.toLowerCase();
    if (envLevel && envLevel in LOG_LEVELS) {
      this.level = envLevel as LogLevel;
    }
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Check if a log level should be printed
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  /**
   * Format a log message
   */
  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (data !== undefined) {
      const dataStr = typeof data === 'object'
        ? JSON.stringify(data, null, 2)
        : String(data);
      return `${prefix} ${message}\n${dataStr}`;
    }

    return `${prefix} ${message}`;
  }

  /**
   * Log to stderr (to avoid interfering with MCP stdio)
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (this.shouldLog(level)) {
      console.error(this.format(level, message, data));
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }
}

export const logger = new Logger();
