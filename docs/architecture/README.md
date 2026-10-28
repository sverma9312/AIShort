# AIShort — Architecture

`aishort-architecture.drawio` is the reference architecture diagram (draw.io / diagrams.net format).

## How to open

- **Browser:** go to <https://app.diagrams.net> → _File → Open from → Device_ → pick `aishort-architecture.drawio`.
- **VS Code:** install the _Draw.io Integration_ extension (`hediet.vscode-drawio`) and open the file.
- **Desktop:** [draw.io desktop app](https://github.com/jgraph/drawio-desktop/releases) (free).

Use the page tabs at the bottom to switch between diagrams.

## Pages

| Page                          | What it shows                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1. System Overview            | Every component: sources, GitHub Actions pipeline, Supabase, LLM providers, GitHub Pages feed, push, Expo app, EAS release, monitoring |
| 2. Ingestion Pipeline Flow    | One pipeline run step by step, including dedupe, LLM validation, retries, publish and push decisions                                   |
| 3. Data Model & Feed Contract | Postgres tables, relationships, access rules, retention, and the public `latest.json` / `meta.json` format                             |
| 4. Mobile App                 | Screen map (Expo Router) and the offline-first feed refresh flow (cache → ETag revalidation → fallback)                                |

## Key decisions

- **Static feed, no app server:** the feed is the same for every user, so it is built every 30 min and served as JSON from a CDN.
- **$0 infrastructure, no domain:** GitHub Actions (public repo), GitHub Pages, Supabase, Expo, Sentry and PostHog free tiers.
- **Portable feed URL:** the app reads base URLs from `meta.json` and can be updated over the air, so hosting can move without a store release.
- **Working title:** "AIShort" will be renamed before publishing; the final app ID is chosen at that point.
