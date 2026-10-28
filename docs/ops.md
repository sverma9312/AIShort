# Operations

How to deploy and run the AIShort pipeline on free tiers. Local development: [LOCAL_TESTING.md](LOCAL_TESTING.md).

## One-time setup

### 1. Database (Supabase)

Follow [`supabase/README.md`](../supabase/README.md): create a free project, copy the **session
pooler** connection string, then apply the schema:

```sh
echo 'DATABASE_URL=postgresql://…' >> services/pipeline/.env
pnpm db:migrate
```

(Alternatively paste the files in `supabase/migrations/` into the Supabase SQL editor, in order.
`db:migrate` records what it applied in `pipeline_migrations`; don't mix the two methods.)

### 2. GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**
The feed will be served at `https://<owner>.github.io/<repo>/v1/feed/latest.json` (lowercase owner).

### 3. Secrets and variables

**Settings → Secrets and variables → Actions.**

| Secret                | Required             | Value                                                          |
| --------------------- | -------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`        | yes                  | Supabase session-pooler URI (with password)                    |
| `GEMINI_API_KEY`      | one LLM key required | Google AI Studio key                                           |
| `GROQ_API_KEY`        | recommended          | Groq key (fallback provider)                                   |
| `ANTHROPIC_API_KEY`   | optional             | Paid fallback                                                  |
| `DISCORD_WEBHOOK_URL` | optional             | Alerts channel webhook                                         |
| `EXPO_ACCESS_TOKEN`   | optional             | Expo push security (Milestone 4); see [release.md](release.md) |

| Variable                                          | Default                            | When to set                                                         |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `LLM_PROVIDERS`                                   | `gemini,groq`                      | Change provider order                                               |
| `GEMINI_MODEL` / `GROQ_MODEL` / `ANTHROPIC_MODEL` | see `.env.example`                 | When a provider retires a model                                     |
| `GEMINI_RPM` / `GROQ_RPM`                         | 10 / 30                            | After a billing tier change raises limits                           |
| `FEED_BASE_URLS`                                  | `https://<owner>.github.io/<repo>` | Moving the feed or adding a mirror (comma-separated, primary first) |
| `PUSH_QUIET_HOURS` / `PUSH_TIMEZONE`              | none / `UTC`                       | No pushes during e.g. `22-7` in your audience's time zone           |

### 4. First run

**Actions → Ingest → Run workflow.** Check the run summary (cards published, failed sources) and
open the feed URL. The first run processes at most 60 new items; the next runs catch up.

### 5. Reliable scheduling (recommended)

GitHub delays scheduled workflows under load and **disables them after 60 days without commits**
in a public repo. An external trigger avoids both:

1. Create a fine-grained personal access token: **Settings → Developer settings → Fine-grained
   tokens**, repository access _only this repo_, permission **Actions: Read and write**. Expiry 1 year
   (set a reminder to rotate it).
2. At <https://cron-job.org> (free) create a job:
   - URL: `https://api.github.com/repos/<owner>/<repo>/actions/workflows/ingest.yml/dispatches`
   - Schedule: every 30 minutes · Method: `POST`
   - Headers: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`,
     `X-GitHub-Api-Version: 2022-11-28`
   - Body: `{"ref":"main"}`
3. Keep the built-in schedule as a backup; the workflow's concurrency group queues overlapping runs.

## Day-to-day

| Task                    | How                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| See what a run did      | Actions → Ingest → a run → summary (sources, counts, new cards, LLM usage)                                       |
| Remove a bad card       | Supabase → Table Editor → `cards` → set `hidden = true`, then run Ingest manually                                |
| Add or disable a source | Edit `services/pipeline/sources.yaml` (`enabled: false`), open a PR                                              |
| Change a prompt         | Edit `src/llm/prompts.ts`, bump its version, compare `pnpm --filter @aishort/pipeline eval` reports before/after |
| Rotate a key            | Update the secret in GitHub (and `.env` locally); nothing else to change                                         |
| Schema change           | Add a new file in `supabase/migrations/`, run `pnpm db:migrate` before merging code that needs it                |

## Alerts

With `DISCORD_WEBHOOK_URL` set:

- **Run failed** — any job failed (link to the run).
- **Source failing** — one source failed 3 runs in a row (usually a feed URL change or blocking).
- **LLM unavailable** — every provider failed (quota exhausted or key invalid); stories are deferred, not lost.
- **All sources failed** — network problem on the runner.

Each alert repeats at most every 6 hours while the problem lasts, and a "resolved" message is posted
when it clears.

## Free-tier limits to watch

| Service        | Limit                                            | Our usage                                                     |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| GitHub Actions | Unlimited minutes for public repos               | ~48 runs/day × 2–5 min                                        |
| GitHub Pages   | ~100 GB/month bandwidth, ~10 deploys/hour (soft) | 2 deploys/hour; feed ~15 KB gzipped                           |
| Supabase       | 500 MB database; pauses after 7 days idle        | Well under 100 MB/year (old bookkeeping pruned after 30 days) |
| Gemini / Groq  | Daily request quotas (change often)              | ~100–300 calls/day                                            |

## Troubleshooting

| Symptom                                         | Likely cause                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL is required for live runs in CI`  | Secret missing or misnamed                                                             |
| `connect ETIMEDOUT` / `ENETUNREACH` to Supabase | Using the direct (IPv6-only) connection string; use the session pooler                 |
| Deploy job fails with "Pages not enabled"       | Step 2 not done                                                                        |
| Feed not updating but runs are green            | Check the run summary: no new items, or everything deferred (`LLM unavailable`)        |
| Scheduled runs stopped                          | 60 days without commits disabled the schedule; re-enable in Actions, and set up step 5 |
