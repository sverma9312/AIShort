import { cp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Copies the static pages (landing, privacy policy, support) next to the feed. GitHub Pages
 * deploys replace the whole site, so they must be part of every deploy.
 */
export async function copyStaticSite(webDir: string, outDir: string): Promise<void> {
  if (!existsSync(webDir)) throw new Error(`Static site directory not found: ${webDir}`);
  await cp(webDir, outDir, { recursive: true });
  // Serve files as-is (no Jekyll processing on GitHub Pages).
  await writeFile(join(outDir, '.nojekyll'), '');
}
