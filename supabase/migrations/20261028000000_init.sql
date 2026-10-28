-- AIShort initial schema.
--
-- Only the pipeline (service role, direct Postgres connection) reads or writes these tables.
-- The mobile app never reads the database: it downloads static JSON from GitHub Pages. Its only
-- write is registering a push token with the anon key, which RLS restricts to INSERT.
--
-- Source configuration lives in services/pipeline/sources.yaml; only crawl state is stored here.

create extension if not exists pg_trgm;

-- Crawl state per source (cache validators and health).
create table public.source_state (
  source_id            text primary key,
  etag                 text,
  last_modified        text,
  last_ok_at           timestamptz,
  last_error           text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  updated_at           timestamptz not null default now()
);

-- One real-world story, possibly covered by several articles.
create table public.clusters (
  id               text primary key,
  primary_url_hash text not null,
  primary_weight   smallint not null check (primary_weight between 1 and 10),
  first_seen_at    timestamptz not null
);
create index clusters_first_seen_at_idx on public.clusters (first_seen_at);

-- Every processed article. A url_hash present here is never processed again.
create table public.articles (
  url_hash      text primary key check (url_hash ~ '^[0-9a-f]{64}$'),
  url_canonical text not null,
  source_id     text not null,
  title         text not null,
  published_at  timestamptz,
  fetched_at    timestamptz not null,
  status        text not null check (status in ('carded', 'duplicate', 'rejected', 'dropped')),
  reason        text,
  cluster_id    text references public.clusters (id) on delete set null
);
create index articles_cluster_id_idx on public.articles (cluster_id);
create index articles_fetched_at_idx on public.articles (fetched_at);
create index articles_title_trgm_idx on public.articles using gin (title gin_trgm_ops);

-- Published cards. Set hidden = true (e.g. in Supabase Studio) to pull a card from the feed;
-- the next pipeline run republishes without it.
create table public.cards (
  id             text primary key,
  cluster_id     text not null unique references public.clusters (id) on delete cascade,
  headline       text not null,
  summary        text not null,
  category       text not null check (category in ('models', 'research', 'products', 'business', 'policy', 'open-source')),
  importance     smallint not null check (importance between 1 and 10),
  source_name    text not null,
  source_url     text not null check (source_url ~ '^https?://'),
  image_url      text check (image_url ~ '^https?://'),
  published_at   timestamptz not null,
  hidden         boolean not null default false,
  created_at     timestamptz not null default now(),
  llm_provider   text not null,
  prompt_version text not null
);
create index cards_visible_published_at_idx on public.cards (published_at desc) where not hidden;

-- Expo push tokens registered by the app (anon key, insert-only).
create table public.push_tokens (
  token        text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$'),
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Sent pushes: enforces the daily cap and tracks Expo tickets for receipt checks.
create table public.push_log (
  id                  bigint generated always as identity primary key,
  card_id             text not null references public.cards (id) on delete cascade,
  sent_at             timestamptz not null default now(),
  recipients          integer not null check (recipients >= 0),
  ticket_ids          text[] not null default '{}',
  receipts_checked_at timestamptz
);
create index push_log_sent_at_idx on public.push_log (sent_at);

-- Small key/value state for the pipeline (e.g. alert de-duplication).
create table public.pipeline_meta (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row level security: enabled everywhere. With no policies, anon/authenticated can do nothing;
-- the service role bypasses RLS.
alter table public.source_state  enable row level security;
alter table public.clusters      enable row level security;
alter table public.articles      enable row level security;
alter table public.cards         enable row level security;
alter table public.push_tokens   enable row level security;
alter table public.push_log      enable row level security;
alter table public.pipeline_meta enable row level security;

-- Defense in depth: drop Supabase's default table grants for client roles, then allow only
-- inserting push tokens.
revoke all on all tables in schema public from anon, authenticated;
grant insert (token, platform) on public.push_tokens to anon, authenticated;

create policy "Apps can register push tokens"
  on public.push_tokens for insert
  to anon, authenticated
  with check (true);
