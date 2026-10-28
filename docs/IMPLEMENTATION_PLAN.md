# AIShort — Implementation Plan

> Working title: "AIShort" will be renamed before publishing.
> Architecture: [`architecture/aishort-architecture.drawio`](architecture/aishort-architecture.drawio) ·
> Local testing: [`LOCAL_TESTING.md`](LOCAL_TESTING.md)

## Status

| Milestone                   | Scope                                                               | Status                                             |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| **0. Foundation**           | Monorepo, shared feed contract, CI                                  | ✅ Done                                            |
| **1. Pipeline core**        | Sources, normalize, extract, LLM layer, orchestrator, dry/live CLI  | ✅ Done (real LLM path not yet run with live keys) |
| **2. Persistence + deploy** | Supabase, scheduled GitHub Actions run, GitHub Pages deploy, alerts | ⏳ Next                                            |
| **3. Mobile app MVP**       | Expo app: swipe feed, offline cache, bookmarks, settings            | Planned                                            |
| **4. Push + background**    | Push notifications, background refresh                              | Planned                                            |
| **5. Release**              | Final name, EAS builds, store listings, testing tracks              | Planned                                            |

## 1. Principles

1. **Pipeline before app.** Summary quality is the product: get the feed right and soak it for a
   week before investing in UI.
2. **The shared schema is the contract.** `packages/shared` holds the Zod feed schemas. The
   pipeline refuses to publish invalid data; the app drops invalid cards instead of crashing.
3. **Pure logic, injected I/O.** Rules (URL cleanup, dedupe, validation) are plain unit-tested
   functions. Network, LLM and storage sit behind interfaces with fakes for tests.
4. **Small PRs, `main` always green.** One concern per PR, with tests, squash-merged.
5. **Everything runs locally.** `pnpm pipeline:dry` runs the whole pipeline offline on fixtures.

## 2. Conventions

| Topic   | Decision                                                                               |
| ------- | -------------------------------------------------------------------------------------- |
| Runtime | Node 24 LTS (`.nvmrc`, Node ≥ 22.13 works), pnpm 12 via Corepack, TypeScript strict    |
| Quality | ESLint (type-aware) + Prettier, Vitest; jest-expo for the app (Milestone 3)            |
| Git     | `feat/…` / `fix/…` branches, Conventional Commits, squash merge, protected `main`      |
| Config  | Zod-validated env; every variable listed in `services/pipeline/.env.example`           |
| Secrets | GitHub Secrets only; gitleaks in CI. Actions logs are public: never log keys or tokens |
| Time    | UTC everywhere (ISO 8601 with `Z`); the app formats for display                        |

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the workflow and definition of done.

## 3. Repository layout

```
apps/mobile/                 Expo app (Milestone 3)
services/pipeline/
  sources.yaml               news sources
  fixtures/                  fictional sources and pages for tests + dry run
  eval/                      summary quality check against real LLMs
  src/
    config/                  env + .env loading
    sources/                 HTTP client, RSS/Atom, HN, HF Papers, listing-page fetchers
    normalize/               canonical URL, hash, prefilter
    extract/                 Readability extraction, robots.txt
    dedupe/                  title similarity + grouping
    llm/                     providers, failover chain, prompts, classify, summarize, validate
    store/                   Store interface, JSON-backed MemoryStore (Supabase in M2)
    publish/                 build + write feed files
    run.ts · cli.ts          orchestration · entry point
packages/shared/             Zod schemas, types, countWords(), feed paths, contract fixtures
supabase/migrations/         (Milestone 2)
docs/                        architecture, plan, testing guide
.github/workflows/           ci.yml (now), ingest.yml + eas-build.yml (later)
```

## 4. Milestones

### Milestone 0 — Foundation ✅

| PR                   | What                                                                                                                                                                  | Commit    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1. Scaffold          | pnpm workspaces + dependency catalog, strict tsconfig, ESLint/Prettier, README, CONTRIBUTING, MIT license                                                             | `67e9cca` |
| 2. `packages/shared` | `Card` / `Feed` / `Meta` schemas (≤ 60-word summary, ≤ 12-word headline, http(s)-only URLs, UTC), `countWords()`, `parseFeedLenient()`, feed paths, contract fixtures | `4db5328` |
| 3. CI                | `ci.yml` (format, lint, typecheck, test; fork-safe, SHA-pinned actions), gitleaks, Dependabot, PR template                                                            | `b1134f0` |

### Milestone 1 — Pipeline core ✅

| PR                       | What                                                                                                                                                                                            | Commit    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4. Sources + fetchers    | `sources.yaml` (18 sources), HTTP client with conditional GET / timeout / size cap, RSS 2.0 · RSS 1.0 · Atom, HN Algolia, HF Daily Papers, HTML listing pages                                   | `42ed8b5` |
| 5. Normalize + prefilter | `canonicalUrl()` (tracking params, AMP, slashes), `urlHash()`, 48 h / min-points / AI-keyword prefilter                                                                                         | `0b66e8b` |
| 6. Extract               | Readability text + Open Graph / JSON-LD metadata, robots.txt (RFC 9309)                                                                                                                         | `44cb9cb` |
| 7. LLM layer             | Gemini / Groq / Anthropic over REST, `ProviderChain` (throttling, failover, disable on quota/auth), batched classifier, summarizer with one validated retry, grounding validator, `eval` script | `d87c766` |
| fixes                    | Boilerplate/author-bio stripping, paragraph breaks, heuristic fixes — found by live runs                                                                                                        | `b185a5b` |
| 8. Orchestrator          | `runPipeline()`, dedupe + attribution, listing-page baseline, per-run cap, `MemoryStore`, `buildSite()`, CLI (`pipeline:dry`, `pipeline:live`), end-to-end tests                                | `4d0fd3e` |

**Exit criteria (to confirm with real keys):** `pnpm pipeline:live` produces a feed you'd want to
read, and `pnpm --filter @aishort/pipeline eval` passes the sample articles.

### Milestone 2 — Persistence + automated deploy ⏳

| PR                  | What                                                                                                                                                             | Key details                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 9. Database schema  | `supabase/migrations/0001_init.sql`: tables from diagram page 3, indexes, `pg_trgm`, `pgvector`, RLS (anon key may only INSERT into `push_tokens`), seed sources | Local Supabase CLI (needs Docker)                                                                                                |
| 10. `SupabaseStore` | Implements the existing `Store` interface; similarity via `pg_trgm` over the last 48 h                                                                           | Embeddings only if the soak shows too many cross-outlet duplicates                                                               |
| 11. `ingest.yml`    | `*/30` cron + `workflow_dispatch`, `concurrency: ingest`, 10-min timeout, `upload-pages-artifact` + `deploy-pages`                                               | **Each Pages deploy replaces the whole site**: rebuild latest, meta, all 30 archive days and the privacy/support pages every run |
| 12. Observability   | Run summary in `$GITHUB_STEP_SUMMARY` (from `formatReport`), source-health alerts (Discord after 3 failures), cron-job.org trigger documented in `docs/ops.md`   |                                                                                                                                  |

**Soak week** — ready for users when: ≥ 95 % of runs succeed, < 5 % bad summaries in a review of
100 cards, duplicates are rare, and the feed is never more than an hour stale.

### Milestone 3 — Mobile app MVP

| PR                | What                                                                                                                   | Key details                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 13. Expo scaffold | `apps/mobile` (TypeScript, Expo Router), Metro configured for the monorepo, imports `@aishort/shared`                  | `node-linker=hoisted` if React Native resolution needs it; placeholder app ID |
| 14. Data layer    | `feedClient`: ETag requests, fallback base URLs from `meta.json`, `parseFeedLenient()`; MMKV; TanStack Query persister | Tests for 200 / 304 / network error / malformed card                          |
| 15. Feed screen   | `<Card />` + vertical `PagerView`; loading, empty, error, offline states; prefetch next 5 images                       | Render only current ±2 cards; test on a low-end Android                       |
| 16. Card actions  | Read more (`expo-web-browser`), Share, Bookmarks (full card copy in MMKV), category filter                             |                                                                               |
| 17. Settings      | Theme, categories, notifications toggle, privacy link, version                                                         |                                                                               |
| 18. Telemetry     | Sentry + PostHog with opt-out, error boundary, no personal data                                                        |                                                                               |
| 19. E2E smoke     | Maestro flows: launch → swipe → bookmark → read more                                                                   |                                                                               |

### Milestone 4 — Push + background refresh

| PR                     | What                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| 20. App push           | Ask permission after ~10 cards read; token → Supabase (anon key); Android channel; `card/[id]` deep link |
| 21. Pipeline notify    | Expo push in batches of 100, receipts clean up dead tokens, ≤ 2 pushes/day via `push_log`, quiet hours   |
| 22. Background refresh | `expo-background-task`, roughly hourly (OS decides)                                                      |

### Milestone 5 — Release

| Task                    | What                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| 23. Final name + app ID | Rename everywhere; the app ID can't change after the first upload                                     |
| 24. EAS                 | `eas.json` profiles, EAS Update channels, `eas-build.yml` on `v*` tags                                |
| 25. Store assets        | Icon, splash, screenshots; Play Data safety, content rating, News apps declaration; Apple App Privacy |
| 26. Testing tracks      | Start Play closed testing (12 testers × 14 days) at the end of Milestone 3; TestFlight in parallel    |

## 5. Testing strategy

| Layer                 | Tool                                                       | Protects                                                 |
| --------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Unit                  | Vitest                                                     | URL cleanup, prefilter, extraction, validators, failover |
| Contract              | Shared Zod schemas + `packages/shared/fixtures`            | Pipeline and app agree on the feed                       |
| End-to-end (pipeline) | `run.test.ts` on the dry-run fixtures                      | Cards, dedupe, idempotency, LLM outages, baseline, caps  |
| LLM quality           | `pnpm --filter @aishort/pipeline eval` (manual, real keys) | Summary quality across prompt changes                    |
| Integration           | Local Supabase, nightly (M2)                               | SQL, RLS, similarity queries                             |
| App E2E               | Maestro (M3)                                               | Core flows on real builds                                |
| Production guard      | Schema validation before every publish                     | A bad run never replaces a good feed                     |

## 6. Decisions and deviations log

| Decision                                                          | Why                                                                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TypeScript held at 6.0.x                                          | typescript-eslint supports TypeScript < 6.1; Dependabot ignores ≥ 6.1                                                         |
| `fetch` injected into the HTTP client instead of MSW              | Simpler tests and the same fixture `fetch` powers the dry run                                                                 |
| pnpm `allowBuilds: esbuild`                                       | pnpm 12 blocks install scripts; tsx needs esbuild's                                                                           |
| Mistral via RSS (`/news/rss`), Anthropic + Meta via listing pages | Found while smoke-testing live sources                                                                                        |
| VentureBeat disabled                                              | Returned HTTP 429 when checked                                                                                                |
| Listing-page baseline on first crawl                              | Listing pages have no dates; avoids publishing a site's back catalog                                                          |
| Titles with different numbers never merge                         | "GPT-6" vs "GPT-7" would otherwise look like the same story                                                                   |
| Models are env settings (`GEMINI_MODEL`, `GROQ_MODEL`)            | Free-tier model lineups change often                                                                                          |
| A Gemini (Google AI Pro) subscription doesn't raise API limits    | API keys are billed per Cloud project tier; start on the free tier, link billing (with a budget alert) only if quotas run out |

## 7. Known limitations

- Duplicate detection uses titles only; differently worded coverage of the same story isn't merged yet.
- Some publishers block article fetching (e.g. Ars Technica, HTTP 405); their RSS description is used.
- Default model names haven't been verified against live APIs.
