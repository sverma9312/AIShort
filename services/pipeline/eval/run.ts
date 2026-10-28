/**
 * Summary quality check against real LLM providers.
 *
 *   pnpm --filter @aishort/pipeline eval
 *
 * Summarizes every article in eval/articles/*.json (plus eval/articles/local/*.json, which is
 * gitignored for real articles you don't want to commit) and writes a Markdown report to
 * eval/out/. Run it before and after every prompt change and compare the reports.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countWords } from '@aishort/shared';
import { z } from 'zod';
import { loadDotEnv } from '../src/config/dotenv';
import { loadEnv } from '../src/config/env';
import { ProviderChain } from '../src/llm/chain';
import { createProviders } from '../src/llm/factory';
import { SUMMARIZE_PROMPT_VERSION } from '../src/llm/prompts';
import { LlmSummarizer, type SummarizeResult } from '../src/llm/summarize';

const EVAL_DIR = fileURLToPath(new URL('.', import.meta.url));
const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceName: z.string(),
  text: z.string().min(100),
});

async function readArticles(dir: string): Promise<z.infer<typeof ArticleSchema>[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  return Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map(async (f) => ArticleSchema.parse(JSON.parse(await readFile(join(dir, f), 'utf8')))),
  );
}

loadDotEnv(join(EVAL_DIR, '..', '.env'));
const env = loadEnv();
const { providers, skipped } = createProviders(env);
if (providers.length === 0) {
  console.error(
    `No LLM provider has an API key (skipped: ${skipped.join(', ')}). See services/pipeline/.env.example.`,
  );
  process.exit(1);
}

const articles = [
  ...(await readArticles(join(EVAL_DIR, 'articles'))),
  ...(await readArticles(join(EVAL_DIR, 'articles', 'local'))),
];
const chain = new ProviderChain(providers);
const summarizer = new LlmSummarizer(chain);
const rows: {
  id: string;
  ms: number;
  result: SummarizeResult | { ok: false; issues: string[]; attempts: 0 };
}[] = [];

for (const article of articles) {
  const start = Date.now();
  let result: (typeof rows)[number]['result'];
  try {
    result = await summarizer.summarize(article);
  } catch (error) {
    result = {
      ok: false,
      issues: [error instanceof Error ? error.message : String(error)],
      attempts: 0,
    };
  }
  rows.push({ id: article.id, ms: Date.now() - start, result });
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${article.id}  (${Date.now() - start} ms)`);
}

const passed = rows.filter((r) => r.result.ok);
const firstTry = passed.filter((r) => r.result.attempts === 1);
const avg = (values: number[]) =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
const lines = [
  `# Summary eval — ${new Date().toISOString()}`,
  '',
  `Prompt: \`${SUMMARIZE_PROMPT_VERSION}\` · Providers: ${chain.providerNames.join(' → ')} · Models: gemini=${env.GEMINI_MODEL}, groq=${env.GROQ_MODEL}, anthropic=${env.ANTHROPIC_MODEL}`,
  '',
  `| Metric | Value |`,
  `|---|---|`,
  `| Articles | ${rows.length} |`,
  `| Valid cards | ${passed.length} (${Math.round((100 * passed.length) / (rows.length || 1))}%) |`,
  `| Valid on first try | ${firstTry.length} |`,
  `| Avg summary words | ${avg(passed.map((r) => (r.result.ok ? countWords(r.result.summary) : 0)))} |`,
  `| Avg latency | ${avg(rows.map((r) => r.ms))} ms |`,
  `| Provider stats | \`${JSON.stringify(chain.stats())}\` |`,
  '',
  ...rows.flatMap(({ id, ms, result }) => [
    `## ${id} — ${result.ok ? `✅ ${result.provider}, attempt ${result.attempts}` : '❌ failed'} (${ms} ms)`,
    '',
    ...(result.ok
      ? [
          `**${result.headline}**`,
          '',
          `${result.summary}`,
          '',
          `_${countWords(result.summary)} words_`,
        ]
      : [`Issues: ${result.issues.join('; ')}`]),
    '',
  ]),
];

const outDir = join(EVAL_DIR, 'out');
await mkdir(outDir, { recursive: true });
const reportPath = join(outDir, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
await writeFile(reportPath, lines.join('\n'));
console.log(`\n${passed.length}/${rows.length} valid · report: ${reportPath}`);
