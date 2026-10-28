export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Line-oriented logger on stderr (stdout is reserved for the run summary).
 * Logs are public in GitHub Actions: never pass secrets, tokens or request headers as fields.
 */
export function createLogger(
  level: LogLevel = 'info',
  write: (line: string) => void = (l) => process.stderr.write(`${l}\n`),
): Logger {
  const log = (at: LogLevel) => (message: string, fields?: Record<string, unknown>) => {
    if (ORDER[at] < ORDER[level]) return;
    write(
      `${at.toUpperCase().padEnd(5)} ${message}${fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : ''}`,
    );
  };
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
