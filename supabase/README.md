# Supabase

Database for the pipeline's state: processed articles, story clusters, cards, crawl state and
push tokens. The app never reads it — it downloads the static feed from GitHub Pages.

## Set up (free tier)

1. Create a project at <https://supabase.com/dashboard> (free plan). Save the database password.
2. **SQL Editor → New query**: paste and run every file in `migrations/`, in name order.
3. **Project Settings → Database → Connection string → Session pooler** (IPv4-compatible; GitHub
   Actions runners have no IPv6). Copy the URI and insert your password. This is `DATABASE_URL`.
4. Add `DATABASE_URL` as a GitHub Actions secret, and to `services/pipeline/.env` for local runs.
5. For push notifications (Milestone 4) the app also needs the project URL and the **anon** key
   (Project Settings → API): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   The anon key is safe to ship in the app: RLS only lets it insert push tokens.

Free projects pause after a week without activity; the pipeline's 30-minute runs keep it active.

## Editing content

To pull a card from the feed, open **Table Editor → cards**, set `hidden` to `true`, and trigger the
**Ingest** workflow (or wait for the next run).

## Migrations

Files in `migrations/` are applied in name order, each exactly once. Never edit an applied
migration; add a new file instead. The pipeline tests apply every migration to an in-process
Postgres (PGlite) on each run, so a broken migration fails CI.
