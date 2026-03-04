// backend/src/utils/logger.ts
import fs from 'fs';
import path from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Resolve the repository root assuming compiled files live in backend/dist/utils.
 * __dirname (at runtime) ≈ <repo>/backend/dist/utils
 *   ../..  → <repo>/backend
 *   ../../.. → <repo>
 */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

// Logs go to <repo>/var/logs/backend.log in dev/test
const logDir = path.join(repoRoot, 'var', 'logs');
const logFilePath = path.join(logDir, 'backend.log');

/**
 * Ensure var/logs exists. If it can't be created, we still log to console.
 */
function ensureLogDirExists() {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch {
    // Failure to create log dir should not crash the app.
  }
}

/**
 * Format a log line with timestamp + level.
 */
function formatLine(level: LogLevel, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] ${level.toUpperCase()} ${message}\n`;
}

/**
 * Stringify arbitrary log arguments into something readable.
 */
function stringifyArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
}

/**
 * Core logging function. In non-production, logs go to both file and console.
 * In production, logs go to console only (stdout/stderr) for container/infra capture.
 */
function writeLog(level: LogLevel, args: unknown[]) {
  const message = stringifyArgs(args);
  const line = formatLine(level, message);

  // Always log to console
  switch (level) {
    case 'debug':
    case 'info':
      console.log(message);
      break;
    case 'warn':
      console.warn(message);
      break;
    case 'error':
      console.error(message);
      break;
  }

  // Only write to file outside production (dev/test/local)
  if (NODE_ENV !== 'production') {
    try {
      ensureLogDirExists();
      fs.appendFileSync(logFilePath, line, { encoding: 'utf8' });
    } catch {
      // If file logging fails, don't crash the app.
    }
  }
}

// Public API

export function debug(...args: unknown[]) {
  writeLog('debug', args);
}

export function info(...args: unknown[]) {
  writeLog('info', args);
}

export function warn(...args: unknown[]) {
  writeLog('warn', args);
}

export function error(...args: unknown[]) {
  writeLog('error', args);
}

/**
 * Convenience alias when you don't care about the level name.
 */
export function log(...args: unknown[]) {
  info(...args);
}
