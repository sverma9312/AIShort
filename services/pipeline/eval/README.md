# Summary eval

Checks summary quality against the real LLM providers configured in `services/pipeline/.env`.

```sh
cp services/pipeline/.env.example services/pipeline/.env   # then add at least one API key
pnpm --filter @aishort/pipeline eval
```

- `articles/*.json` — fictional sample articles (committed).
- `articles/local/*.json` — your own samples, e.g. real articles (gitignored; don't commit them).
- `out/` — Markdown reports (gitignored).

Each article file is `{ "id", "title", "sourceName", "text" }`. Run the eval before and after every
prompt change (and bump the prompt version in `src/llm/prompts.ts`), then compare the reports.
