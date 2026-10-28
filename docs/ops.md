# Operations

How the production pipeline is set up and run. Everything here is free-tier.

## One-time setup

1. **Supabase**: create a free project, open _SQL Editor_, paste and run
   `supabase/migrations/0001_init.sql`. From _Settings → API_ copy the project URL, the
   `service_role` key (pipeline only) and the `anon` key (mobile app).
2. **GitHub repository secrets** (_Settings → Secrets and variables → Actions_):

   | Secret                      | Required             | Used for                                                       |
   | --------------------------- | -------------------- | -------------------------------------------------------------- |
   | `SUPABASE_URL`              | yes                  | Pipeline state                                                 |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes                  | Pipeline state (bypasses RLS — never put it in the app)        |
   | `GEMINI_API_KEY`            | at least one LLM key | Classification + summaries                                     |
   | `GROQ_API_KEY`              | optional             | Fallback LLM                                                   |
   | `ANTHROPIC_API_KEY`         | optional             | Paid fallback LLM                                              |
   | `DISCORD_WEBHOOK_URL`       | optional             | Alerts                                                         |
   | `EXPO_ACCESS_TOKEN`         | optional             | Push notifications (Milestone 4); also used by `eas-build.yml` |

   Optional **variables** (same page, _Variables_ tab): `LLM_PROVIDERS`, `GEMINI_MODEL`,
   `GROQ_MODEL`, `FEED_BASE_URLS` (defaults to `https://<owner>.github.io/<repo>`).

3. **GitHub Pages**: _Settings → Pages → Build and deployment → Source: GitHub Actions_.
4. **Run once**: _Actions → Ingest → Run workflow_. The feed appears at
   `https://<owner>.github.io/<repo>/v1/feed/latest.json`.

## Reliable scheduling (cron-job.org)

GitHub's `schedule` trigger can start 5–15 minutes late, and in public repositories it is
disabled after 60 days without commits. A free external trigger fixes both:

1. Create a **fine-grained personal access token**: only this repository, permission
   _Actions: Read and write_, nothing else. Give it an expiry and a calendar reminder.
2. On [cron-job.org](https://cron-job.org) create a job every 30 minutes:
   - URL: `https://api.github.com/repos/<owner>/<repo>/actions/workflows/ingest.yml/dispatches`
   - Method `POST`, body `{"ref":"main"}`
   - Headers: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`,
     `X-GitHub-Api-Version: 2022-11-28`
3. The workflow's `concurrency: ingest` makes overlapping triggers queue instead of colliding.

## Monitoring

- Each run writes a summary (sources, counts, skip reasons, LLM usage, new cards) to the run page.
- Discord alerts fire when a source fails 3 runs in a row, when no LLM is available, or when
  every source fails.
- Source health is in the `source_state` table (`consecutive_failures`, `last_error`).

## Editing the feed

In Supabase _Table Editor → cards_, set `hidden = true` on a bad card (or fix its `headline` /
`summary`). The next run republishes the feed without it (or with the fix).

## Costs and limits

- GitHub Actions: unlimited minutes for public repositories; Pages ~100 GB/month soft limit.
- Supabase free tier: 500 MB database; projects pause after a week of inactivity, which the
  30-minute pipeline prevents.
- LLM: see `services/pipeline/.env.example`; a Gemini app subscription doesn't raise API limits.
