# Contributing

## Workflow

1. Branch from `main`: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`.
2. Keep each PR focused on one change, with tests.
3. Run `pnpm check` locally before pushing — it runs exactly what CI runs.
4. Open a PR; CI must be green. PRs are **squash-merged**, so the PR title becomes the commit
   message on `main`.

## Commit messages / PR titles

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(shared): add archive path helper
fix(pipeline): handle feeds without pubDate
chore(deps): bump zod
```

Common scopes: `shared`, `pipeline`, `mobile`, `db`, `ci`, `docs`.

## Code conventions

- TypeScript in strict mode everywhere; no `any` without a comment explaining why.
- Keep business logic in pure, unit-tested functions; put I/O (network, database, LLM) behind
  interfaces so it can be faked in tests.
- `packages/shared` is the contract between the pipeline and the app. Changing a schema means
  updating both sides and the contract fixtures in the same PR.
- Store and transmit times in UTC (ISO 8601 with `Z`); format for display only in the app.
- New configuration goes through a Zod-validated env loader, with a matching entry in
  `.env.example`.

## Secrets and the public repository

This repository and its **GitHub Actions logs are public**.

- Secrets live only in GitHub Secrets — never in code, fixtures or `.env.example`.
- Never log API keys, request headers, push tokens or full LLM requests.
- `gitleaks` runs in CI on every push and PR.
- Workflows triggered by pull requests from forks do not receive secrets, so `ci.yml` must work
  without any.

## Definition of done

- [ ] Tests added or updated, and `pnpm check` passes
- [ ] No new env variables without a matching `.env.example` entry
- [ ] Docs / architecture diagram updated if the design changed
- [ ] App changes checked on a real device or emulator
