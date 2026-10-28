# Testing AIShort locally

Everything below runs from the repository root unless noted. Steps 1–4 need no API keys and no
network access beyond installing dependencies.

## 1. Prerequisites

- **Node.js 24 LTS** (see `.nvmrc`; Node ≥ 22.13 also works). With nvm: `nvm install && nvm use`.
- **pnpm** via Corepack (bundled with Node):

```sh
corepack enable          # once; installs the pnpm version pinned in package.json
pnpm --version           # should print 12.x
```

If `corepack enable` fails with a permissions error, run it with `sudo`, or use
`corepack enable --install-directory ~/.local/bin` and make sure that directory is on your `PATH`.

## 2. Install and run all checks

```sh
pnpm install
pnpm check               # format check + lint + typecheck + all tests (same as CI)
```

Expected: `All matched files use Prettier code style!`, no lint or type errors, and every test
file passing for `packages/shared` and `services/pipeline`.

Run parts individually while developing:

```sh
pnpm lint
pnpm typecheck
pnpm test                                                    # all packages
pnpm --filter @aishort/pipeline test                         # one package
pnpm --filter @aishort/pipeline exec vitest run src/run.test.ts   # one file
pnpm --filter @aishort/pipeline exec vitest                  # watch mode
pnpm format                                                  # fix formatting
```

## 3. Offline dry run (no keys, no network)

```sh
pnpm pipeline:dry
```

This runs the full pipeline on the fictional fixtures in `services/pipeline/fixtures/` with a
fixed clock (2026-10-28T10:00Z), a keyword classifier and an extractive summarizer. Expected:

```
Sources   5/5 ok
Fetched   13 items → 8 new → 6 with text → 5 stories → 5 classified → 5 cards
Skipped   too-old=2 low-points=2 not-ai=1 same-url=1 no-text=1 same-story=1 ...
```

Output is written to `services/pipeline/out/`:

```
services/pipeline/out/v1/feed/latest.json
services/pipeline/out/v1/feed/archive/2026-10-27.json
services/pipeline/out/v1/feed/archive/2026-10-28.json
services/pipeline/out/v1/meta.json
```

Inspect it:

```sh
node -e 'const f=require("./services/pipeline/out/v1/feed/latest.json"); for (const c of f.cards) console.log(`[${c.importance}] ${c.category} — ${c.headline}\n    ${c.summary}\n`)'
```

## 4. Live sources without an LLM key

Fetches the real sources in `services/pipeline/sources.yaml` but still uses the offline
classifier and summarizer, so it costs nothing:

```sh
pnpm pipeline:live --llm offline --state /tmp/aishort/store.json --out /tmp/aishort/out
```

Expected: `17/17 ok` sources (an individual site can be temporarily down), a few thousand items
fetched, and a few dozen cards. Offline headlines are just truncated titles — that's expected.

Run the same command again: only new or previously deferred items are processed, and no existing
card is recreated. To start over, delete the state file (`rm -rf /tmp/aishort`).

> Pass options directly after the script name. Don't add `--`
> (`pnpm pipeline:live -- --llm offline` fails with "Unexpected argument").

## 5. Live run with a real LLM

1. Create the env file and add at least one key:

   ```sh
   cp services/pipeline/.env.example services/pipeline/.env
   ```

   - `GEMINI_API_KEY` — from https://aistudio.google.com/apikey (free tier).
     A Gemini app subscription (Google AI Pro) does **not** raise API limits.
   - `GROQ_API_KEY` — from https://console.groq.com/keys (free tier), used as fallback.
   - `ANTHROPIC_API_KEY` — optional paid fallback.

   `.env` is gitignored. Never commit it or paste keys into issues or chats.

2. Check summary quality on the sample articles:

   ```sh
   pnpm --filter @aishort/pipeline eval
   ```

   Prints PASS/FAIL per article and writes a report to `services/pipeline/eval/out/`. Add your own
   samples as `services/pipeline/eval/articles/local/*.json` (gitignored):
   `{ "id", "title", "sourceName", "text" }`.

3. Run the pipeline:

   ```sh
   pnpm pipeline:live
   ```

   State is kept in `services/pipeline/.state/store.json` and the feed in
   `services/pipeline/out/`. The summary ends with an `LLM` line showing calls, failures and any
   disabled provider per provider. Add `--verbose` for debug logs or
   `--report /tmp/report.json` for a JSON report.

At the default Gemini free-tier rate (10 requests/minute) the first run can take a few minutes:
up to 60 new items are processed per run, and the rest are picked up by the next run.

## 6. CLI reference

```
pnpm pipeline:dry  [options]      # = tsx src/cli.ts --mode dry
pnpm pipeline:live [options]      # = tsx src/cli.ts --mode live

--llm offline|real   default: offline for dry, real for live
--out <dir>          default: services/pipeline/out
--state <file>       default: none for dry (fresh each time), services/pipeline/.state/store.json for live
--sources <file>     default: fixtures/sources.dry.yaml (dry) or sources.yaml (live)
--report <file>      also write the run report as JSON
--verbose            debug logging
```

Exit code is `0` on success (including runs where the LLM was unavailable and stories were
deferred) and `1` if every source failed or the configuration is invalid.

## 7. Troubleshooting

| Symptom                                        | Fix                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm: command not found`                      | Run `corepack enable` (step 1)                                                                                                           |
| `ERR_PNPM_IGNORED_BUILDS … esbuild`            | Your pnpm differs from the pinned one; run `corepack enable` so the version in `package.json` is used                                    |
| `Unsupported engine` / syntax errors           | Use Node 24 (`nvm use`)                                                                                                                  |
| `No LLM provider has an API key`               | Add a key to `services/pipeline/.env`, or use `--llm offline`                                                                            |
| `LLM providers skipped (no API key)` warning   | Expected if you only set one provider's key                                                                                              |
| `LLM unavailable … deferred`                   | Quotas are exhausted or keys are invalid; check the `LLM` line (`disabled: rate-limit` or `auth`). Deferred stories are retried next run |
| `HTTP 404` / unknown model from Gemini or Groq | The default model isn't available to your key; set `GEMINI_MODEL` / `GROQ_MODEL` to one listed in your provider console                  |
| A source shows `error`                         | Usually a temporary outage or blocking; other sources are unaffected. Check `lastError` in the state file                                |
| Feed looks stale between live runs             | Expected: items older than 48 h are ignored and each URL is processed only once. Delete the state file to reprocess                      |
