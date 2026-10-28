/**
 * Pipeline entry point.
 *
 *   pnpm pipeline:dry    offline: fixture sources, fixed clock, offline classifier/summarizer
 *   pnpm pipeline:live   real sources and LLM providers (.env), state kept in .state/
 *
 * Options: --mode dry|live  --llm offline|real  --store memory|supabase  --out <dir>
 *          --state <file>  --sources <file>  --web <dir>  --report <file> (JSON)  --verbose
 *
 * State: dry runs start empty; live runs use Supabase when DATABASE_URL is set, otherwise
 * .state/store.json. In CI, live runs require DATABASE_URL.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadDotEnv } from './config/dotenv';
import { BOT_NAME, listOf, loadEnv, userAgent } from './config/env';
import { HttpArticleFetcher } from './extract/fetchArticle';
import { RobotsChecker } from './extract/robots';
import { createLogger } from './lib/log';
import { ProviderChain } from './llm/chain';
import { HeuristicClassifier, LlmClassifier, type Classifier } from './llm/classify';
import { createProviders } from './llm/factory';
import { ExtractiveSummarizer, LlmSummarizer, type Summarizer } from './llm/summarize';
import { buildSite, writeSite } from './publish/buildSite';
import { copyStaticSite } from './publish/staticSite';
import { formatReport } from './report';
import { runPipeline } from './run';
import { loadSources } from './sources/config';
import { createFixtureFetch } from './sources/fixtureFetch';
import { HttpClient } from './sources/http';
import { hoursBefore } from './lib/time';
import { chooseStore } from './store/choose';
import { MemoryStore } from './store/memoryStore';
import { createPostgresClient } from './store/sql';
import { SupabaseStore } from './store/supabaseStore';
import type { Store } from './store/types';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES_DIR = join(PACKAGE_DIR, 'fixtures');
const WEB_DIR = join(PACKAGE_DIR, '..', '..', 'web');
/** Bookkeeping for articles that never became cards is kept this long. */
const RETENTION_DAYS = 30;

const ManifestSchema = z.object({
  now: z.iso.datetime(),
  routes: z.record(
    z.string(),
    z.object({
      file: z.string().optional(),
      body: z.string().optional(),
      status: z.number().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
  ),
  seedSourceState: z.record(z.string(), z.object({ lastOkAt: z.string() })).default({}),
});

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string' },
      llm: { type: 'string' },
      out: { type: 'string' },
      state: { type: 'string' },
      store: { type: 'string' },
      web: { type: 'string' },
      sources: { type: 'string' },
      report: { type: 'string' },
      verbose: { type: 'boolean', default: false },
    },
    strict: true,
  });
  const mode = values.mode;
  if (mode !== 'dry' && mode !== 'live') throw new Error('--mode must be "dry" or "live"');
  const llmMode = values.llm ?? (mode === 'dry' ? 'offline' : 'real');
  if (llmMode !== 'offline' && llmMode !== 'real')
    throw new Error('--llm must be "offline" or "real"');

  loadDotEnv(join(PACKAGE_DIR, '.env'));
  const env = loadEnv();
  const log = createLogger(values.verbose ? 'debug' : 'info');
  const outDir = resolve(values.out ?? join(PACKAGE_DIR, 'out'));

  // Sources, HTTP and clock: fixtures for dry runs, the internet for live runs.
  let now = new Date();
  let fetchFn: ConstructorParameters<typeof HttpClient>[0]['fetch'];
  let seed: Record<string, { lastOkAt: string }> = {};
  if (mode === 'dry') {
    const manifest = ManifestSchema.parse(
      JSON.parse(await readFile(join(FIXTURES_DIR, 'http', 'manifest.json'), 'utf8')),
    );
    now = new Date(manifest.now);
    fetchFn = createFixtureFetch(manifest.routes, join(FIXTURES_DIR, 'http'));
    seed = manifest.seedSourceState;
  }
  const sources = await loadSources(
    values.sources ??
      (mode === 'dry' ? join(FIXTURES_DIR, 'sources.dry.yaml') : join(PACKAGE_DIR, 'sources.yaml')),
  );
  const http = new HttpClient({
    userAgent: userAgent(env),
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });

  // State: see chooseStore for the rules.
  const choice = chooseStore({
    mode,
    ...(values.store ? { flag: values.store } : {}),
    ...(values.state ? { statePath: resolve(values.state) } : {}),
    defaultStatePath: join(PACKAGE_DIR, '.state', 'store.json'),
    hasDatabaseUrl: Boolean(env.DATABASE_URL),
    inCi: process.env['GITHUB_ACTIONS'] === 'true',
  });
  const sqlClient =
    choice.kind === 'supabase' ? createPostgresClient(env.DATABASE_URL!) : undefined;
  const store: Store = sqlClient
    ? new SupabaseStore(sqlClient)
    : choice.kind === 'memory' && choice.path
      ? await MemoryStore.load(choice.path)
      : new MemoryStore();
  for (const [sourceId, state] of Object.entries(seed)) {
    if (!(await store.getSourceState(sourceId)))
      await store.saveSourceState(sourceId, { ...state, consecutiveFailures: 0 });
  }

  // Classification and summaries: offline heuristics or the real provider chain.
  let classifier: Classifier;
  let summarizer: Summarizer;
  let chain: ProviderChain | undefined;
  if (llmMode === 'real') {
    const { providers, skipped } = createProviders(env);
    if (skipped.length) log.warn('LLM providers skipped (no API key)', { skipped });
    if (providers.length === 0)
      throw new Error(
        'No LLM provider has an API key. Set one in services/pipeline/.env or use --llm offline.',
      );
    chain = new ProviderChain(providers);
    classifier = new LlmClassifier(chain);
    summarizer = new LlmSummarizer(chain);
  } else {
    classifier = new HeuristicClassifier();
    summarizer = new ExtractiveSummarizer();
  }

  log.info('pipeline starting', {
    mode,
    llm: llmMode,
    store: choice.kind,
    sources: sources.filter((s) => s.enabled).length,
    now: now.toISOString(),
  });
  try {
    const report = await runPipeline({
      sources,
      http,
      articles: new HttpArticleFetcher(http, new RobotsChecker(http, BOT_NAME)),
      store,
      classifier,
      summarizer,
      now,
      log,
    });

    const files = await buildSite(store, { now, feedBaseUrls: listOf(env.FEED_BASE_URLS) });
    await writeSite(outDir, files);
    await copyStaticSite(resolve(values.web ?? WEB_DIR), outDir);
    const pruned = await store.prune(hoursBefore(now, RETENTION_DAYS * 24).toISOString());
    if (pruned) log.info('pruned old bookkeeping', { articles: pruned });
    if (choice.kind === 'memory' && choice.path) await (store as MemoryStore).save(choice.path);
    if (values.report)
      await writeFile(
        resolve(values.report),
        `${JSON.stringify({ ...report, llm: chain?.stats() }, null, 2)}\n`,
      );

    process.stdout.write(
      `${formatReport(report, chain?.stats())}\n\nWrote ${files.size} files to ${outDir}\n`,
    );

    const allSourcesFailed =
      report.sources.length > 0 && report.sources.every((s) => s.status === 'error');
    return allSourcesFailed ? 1 : 0;
  } finally {
    await sqlClient?.end();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
