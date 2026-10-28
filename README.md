# AIShort

> **Working title** — the app will be renamed before publishing.

Inshorts-style AI news: every story is a swipeable card with a summary of **at most 60 words**,
linking back to the original source. Available on iOS and Android.

## How it works

A scheduled pipeline (GitHub Actions, every 30 minutes) collects AI news from public sources,
removes duplicates, summarizes each story with an LLM, and publishes the result as static JSON
on GitHub Pages. The Expo mobile app downloads that feed — there is no app server, and the
infrastructure runs entirely on free tiers.

## Documentation

- [Architecture diagram](docs/architecture/) (draw.io)
- [Implementation plan and status](docs/IMPLEMENTATION_PLAN.md)
- [Testing locally](docs/LOCAL_TESTING.md)
- [Pipeline README](services/pipeline/README.md)

## Repository layout

```
apps/mobile/         Expo app (iOS + Android)                    — Milestone 3
services/pipeline/   Ingestion + summarization pipeline (see its README)
packages/shared/     Feed contract: Zod schemas, types, helpers
supabase/            Database migrations                          — Milestone 2
docs/                Architecture and project docs
```

## Getting started

Requirements: Node.js 24 LTS (`.nvmrc`; Node ≥ 22.13 also works) and pnpm via Corepack.

```sh
corepack enable          # makes the pinned pnpm version available
pnpm install
pnpm check               # format check + lint + typecheck + tests
```

| Script                              | What it does                               |
| ----------------------------------- | ------------------------------------------ |
| `pnpm lint`                         | ESLint (type-aware) across the repo        |
| `pnpm format` / `pnpm format:check` | Prettier write / verify                    |
| `pnpm typecheck`                    | `tsc --noEmit` in every package            |
| `pnpm test`                         | Vitest in every package                    |
| `pnpm check`                        | All of the above — the same checks CI runs |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching, commit conventions and the definition of done.

## License

The **source code** is licensed under the [MIT License](LICENSE).

The MIT license does **not** cover news content: article text, images and trademarks belong to
their respective publishers, and generated summaries in the published feed are not offered for
reuse under this license.
