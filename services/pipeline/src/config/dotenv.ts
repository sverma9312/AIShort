import { existsSync } from 'node:fs';

/** Loads a local .env file if present (development only; CI uses GitHub Secrets). */
export function loadDotEnv(path: string): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
