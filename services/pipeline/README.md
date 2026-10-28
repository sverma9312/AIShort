# @aishort/pipeline

Collects AI news, removes duplicates, summarizes each story with an LLM and builds the static
feed (`v1/feed/latest.json`, daily archives, `v1/meta.json`) that the app downloads.

## Run it

```sh
pnpm pipeline:dry     # offline: fixture sources, fixed clock, no API keys, writes services/pipeline/out/
pnpm pipeline:live    # real sources + LLM providers from services/pipeline/.env, state in .state/
pnpm --filter @aishort/pipeline eval   # summary quality report against the real providers
```

For live runs, copy `.env.example` to `.env` and add at least one API key. `--llm offline` runs live
sources without any key (heuristic classifier, extractive summaries). Other options:
`--out <dir>`, `--state <file>`, `--sources <file>`, `--report <file>` (JSON), `--verbose`.

## What one run does

```
sources.yaml ─▶ fetch (conditional GET, 8 in parallel, failures isolated)
             ─▶ canonical URL + hash ─▶ prefilter (48 h, min points, AI keywords) ─▶ skip already seen
             ─▶ extract article text (robots.txt respected; long feed abstracts used as-is)
             ─▶ group same-story titles ─▶ match recent clusters (heavier source takes attribution)
             ─▶ classify new stories (batched LLM) ─▶ summarize (LLM, validated, 1 retry)
             ─▶ store ─▶ build + validate site files
```

- **Exactly-once:** an article is recorded once its outcome is final (card, duplicate, rejected,
  dropped), so it is never processed or paid for twice. If every LLM provider is down, affected
  stories are left unrecorded and retried on the next run.
- **Listing pages** (labs without RSS) have no dates: the first successful crawl of such a source
  records what is already there as a baseline; later new links count as published when first seen,
  unless the article page states a date.
- **Validation:** cards must pass the shared Zod schema, and summaries must pass
  `validateSummary` — ≤ 60 words, no formatting, and every number and name must appear in the source.

## Code map

| Path                        | Responsibility                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/sources/`              | `sources.yaml` schema, HTTP client, RSS/Atom, HN, HF Papers and listing-page fetchers           |
| `src/normalize/`            | Canonical URLs, hashing, prefilter                                                              |
| `src/extract/`              | Readability-based text extraction, robots.txt                                                   |
| `src/dedupe/`               | pg_trgm-compatible title similarity and grouping                                                |
| `src/llm/`                  | Providers (Gemini, Groq, Anthropic), failover chain, prompts, classifier, summarizer, validator |
| `src/store/`                | `Store` interface and the JSON-backed `MemoryStore` (Supabase in Milestone 2)                   |
| `src/publish/`              | Builds and writes the feed files                                                                |
| `src/run.ts` / `src/cli.ts` | Orchestration / entry point                                                                     |
| `fixtures/`                 | Fictional sources and pages for tests and the dry run                                           |

## Known limitations

- Duplicate detection compares titles only, so outlets that word the same story very differently
  are not merged yet. Embedding similarity (pgvector) is planned if the soak shows it's needed.
- Some publishers block article fetching (e.g. Ars Technica returns HTTP 405); their RSS
  description is used instead.
- Default model names are configurable and should be checked against each provider's current
  free tier.
