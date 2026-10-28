-- AIShort initial schema. Mirrors services/pipeline/src/store/types.ts.
-- The pipeline uses the service-role key (bypasses RLS). The app uses the anon key and may only
-- INSERT push tokens; users never read the database (they read static JSON from GitHub Pages).

create extension if not exists pg_trgm;

create table source_state (
  source_id            text primary key,
  etag                 text,
  last_modified        text,
  last_ok_at           timestamptz,
  last_error           text,
  consecutive_failures int not null default 0
);

create table clusters (
  id               text primary key,
  primary_url_hash text not null,
  primary_weight   smallint not null,
  first_seen_at    timestamptz not null
);
create index clusters_first_seen_idx on clusters (first_seen_at);

create table articles (
  url_hash      text primary key,
  url_canonical text not null,
  source_id     text not null,
  title         text not null,
  published_at  timestamptz,
  fetched_at    timestamptz not null,
  status        text not null check (status in ('carded', 'duplicate', 'rejected', 'dropped')),
  reason        text,
  cluster_id    text references clusters (id) on delete set null
);
create index articles_cluster_idx on articles (cluster_id);
create index articles_title_trgm_idx on articles using gin (title gin_trgm_ops);

create table cards (
  id             text primary key,
  cluster_id     text not null unique references clusters (id) on delete cascade,
  headline       text not null,
  summary        text not null,
  category       text not null check (category in ('models', 'research', 'products', 'business', 'policy', 'open-source')),
  importance     smallint not null check (importance between 1 and 10),
  source_name    text not null,
  source_url     text not null check (source_url ~ '^https?://'),
  image_url      text check (image_url ~ '^https?://'),
  published_at   timestamptz not null,
  hidden         boolean not null default false,  -- editor kill switch (Supabase Studio)
  created_at     timestamptz not null default now(),
  llm_provider   text not null,
  prompt_version text not null
);
create index cards_visible_idx on cards (published_at desc) where not hidden;

create table push_tokens (
  token        text primary key check (token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'),
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table push_log (
  id         bigint generated always as identity primary key,
  card_id    text not null references cards (id) on delete cascade,
  sent_at    timestamptz not null default now(),
  recipients int not null
);
create index push_log_sent_idx on push_log (sent_at);

-- Clusters first seen since `since` whose article titles resemble `query`, best first.
-- The pipeline re-scores candidates with its own similarity (which also compares numbers).
create function similar_clusters(query text, since timestamptz, min_similarity real default 0.3, max_results int default 5)
returns table (cluster_id text, title text, similarity real)
language sql stable as $$
  select a.cluster_id, a.title, similarity(a.title, query) as similarity
  from articles a
  join clusters c on c.id = a.cluster_id
  where c.first_seen_at >= since
    and similarity(a.title, query) >= min_similarity
  order by similarity desc
  limit max_results * 4
$$;

-- Row Level Security: deny everything to anon/authenticated except inserting push tokens.
alter table source_state enable row level security;
alter table clusters     enable row level security;
alter table articles     enable row level security;
alter table cards        enable row level security;
alter table push_tokens  enable row level security;
alter table push_log     enable row level security;

create policy "app can register push tokens" on push_tokens
  for insert to anon with check (true);

revoke execute on function similar_clusters(text, timestamptz, real, int) from public, anon, authenticated;
