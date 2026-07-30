/**
 * Minimal structured logging. The service runs as its own container, so its
 * stdout *is* the log — keep every line greppable and on one line.
 */
type Fields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', message: string, fields?: Fields): void {
  const parts = [new Date().toISOString(), level.toUpperCase().padEnd(5), message];
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      parts.push(`${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
  }
  const line = parts.join(' ');
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, fields?: Fields) => emit('info', message, fields),
  warn: (message: string, fields?: Fields) => emit('warn', message, fields),
  error: (message: string, fields?: Fields) => emit('error', message, fields),
};

/** Whatever was thrown, reduced to something loggable. */
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
