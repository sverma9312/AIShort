import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { copyStaticSite } from './staticSite';

const WEB_DIR = fileURLToPath(new URL('../../../../web/', import.meta.url));

describe('copyStaticSite', () => {
  it('copies the landing, privacy and support pages and disables Jekyll', async () => {
    const out = await mkdtemp(join(tmpdir(), 'aishort-web-'));
    await copyStaticSite(WEB_DIR, out);
    expect((await readdir(out)).sort()).toEqual([
      '.nojekyll',
      'index.html',
      'privacy',
      'styles.css',
      'support',
    ]);
    expect(await readFile(join(out, 'privacy', 'index.html'), 'utf8')).toContain('Privacy policy');
  });

  it('fails loudly when the directory is missing', async () => {
    await expect(copyStaticSite('/nonexistent/web', '/tmp/x')).rejects.toThrow(/not found/);
  });
});
