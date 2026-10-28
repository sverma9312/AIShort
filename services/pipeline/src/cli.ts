/**
 * Pipeline entry point.
 *
 *   pnpm pipeline:dry    offline: fixture sources, fixed clock, offline classifier/summarizer
 *   pnpm pipeline:live   real sources and LLM providers (.env), state kept in .state/
 *
 * Options: --mode dry|live  --llm offline|real  --out <dir>  --state <file>  --sources <file>
 *          --report <file> (JSON run report)  --verbose
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
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
import { alertsFor, sendDiscordAlert, stepSummary } from './ops/alerts';
import { buildSite, writeSite } from './publish/buildSite';
import { formatReport } from './report';
import { runPipeline } from './run';
import { loadSources } from './sources/config';
import { createFixtureFetch } from './sources/fixtureFetch';
import { HttpClient } from './sources/http';
import { MemoryStore } from './store/memoryStore';
import { SupabaseStore } from './store/supabaseStore';
import type { Store } from './store/types';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES_DIR = join(PACKAGE_DIR, 'fixtures');

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

  // State: fresh for dry runs (unless --state), persisted JSON for live runs.
  // State: Supabase when configured (live), else a JSON file (live) or fresh memory (dry).
  const useSupabase =
    mode === 'live' && !values.state && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY;
  const statePath = useSupabase
    ? undefined
    : (values.state ?? (mode === 'live' ? join(PACKAGE_DIR, '.state', 'store.json') : undefined));
  const memory = statePath ? await MemoryStore.load(resolve(statePath)) : new MemoryStore();
  const store: Store = useSupabase
    ? new SupabaseStore({ url: env.SUPABASE_URL!, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY! })
    : memory;
  if (useSupabase) log.info('using Supabase store');
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
    sources: sources.filter((s) => s.enabled).length,
    now: now.toISOString(),
  });
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
  if (statePath) await memory.save(resolve(statePath));
  if (values.report)
    await writeFile(
      resolve(values.report),
      `${JSON.stringify({ ...report, llm: chain?.stats() }, null, 2)}\n`,
    );

  process.stdout.write(
    `${formatReport(report, chain?.stats())}\n\nWrote ${files.size} files to ${outDir}\n`,
  );
  const alerts = alertsFor(report);
  for (const alert of alerts) log.warn(`ALERT ${alert}`);
  if (process.env['GITHUB_STEP_SUMMARY']) {
    await appendFile(
      process.env['GITHUB_STEP_SUMMARY'],
      stepSummary(formatReport(report, chain?.stats()), alerts),
    );
  }
  if (env.DISCORD_WEBHOOK_URL && alerts.length) {
    const {
      GITHUB_SERVER_URL: server,
      GITHUB_REPOSITORY: repo,
      GITHUB_RUN_ID: runId,
    } = process.env;
    const runUrl = server && repo && runId ? `${server}/${repo}/actions/runs/${runId}` : undefined;
    if (!(await sendDiscordAlert(env.DISCORD_WEBHOOK_URL, alerts, runUrl)))
      log.warn('Discord alert could not be sent');
  }
  const allSourcesFailed =
    report.sources.length > 0 && report.sources.every((s) => s.status === 'error');
  return allSourcesFailed ? 1 : 0;
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
