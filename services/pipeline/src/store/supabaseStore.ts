import { titleSimilarity } from '../dedupe/similarity';
import type { SqlClient } from './sql';
import type {
  ArticleRecord,
  CardRecord,
  ClusterRecord,
  SimilarCluster,
  SourceState,
  Store,
} from './types';

/**
 * Store backed by Postgres (Supabase), using the schema in supabase/migrations.
 *
 * Similarity search narrows candidates in SQL with pg_trgm, then makes the final decision with
 * the same `titleSimilarity` the in-memory store uses, so both stores dedupe identically.
 */
export class SupabaseStore implements Store {
  constructor(private readonly sql: SqlClient) {}

  async getSourceState(sourceId: string): Promise<SourceState | undefined> {
    const [row] = await this.sql.query<SourceStateRow>(
      'select * from public.source_state where source_id = $1',
      [sourceId],
    );
    if (!row) return undefined;
    return compact({
      etag: row.etag ?? undefined,
      lastModified: row.last_modified ?? undefined,
      lastOkAt: iso(row.last_ok_at),
      lastError: row.last_error ?? undefined,
      consecutiveFailures: row.consecutive_failures,
    });
  }

  async saveSourceState(sourceId: string, state: SourceState): Promise<void> {
    await this.sql.query(
      `insert into public.source_state (source_id, etag, last_modified, last_ok_at, last_error, consecutive_failures, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (source_id) do update set
         etag = excluded.etag, last_modified = excluded.last_modified, last_ok_at = excluded.last_ok_at,
         last_error = excluded.last_error, consecutive_failures = excluded.consecutive_failures, updated_at = now()`,
      [
        sourceId,
        state.etag ?? null,
        state.lastModified ?? null,
        state.lastOkAt ?? null,
        state.lastError ?? null,
        state.consecutiveFailures,
      ],
    );
  }

  async findSeen(urlHashes: readonly string[]): Promise<Set<string>> {
    if (urlHashes.length === 0) return new Set();
    const rows = await this.sql.query<{ url_hash: string }>(
      'select url_hash from public.articles where url_hash = any($1::text[])',
      [[...urlHashes]],
    );
    return new Set(rows.map((r) => r.url_hash));
  }

  async saveArticles(articles: readonly ArticleRecord[]): Promise<void> {
    for (const a of articles) {
      await this.sql.query(
        `insert into public.articles (url_hash, url_canonical, source_id, title, published_at, fetched_at, status, reason, cluster_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (url_hash) do update set
           status = excluded.status, reason = excluded.reason, cluster_id = excluded.cluster_id, title = excluded.title`,
        [
          a.urlHash,
          a.urlCanonical,
          a.sourceId,
          a.title,
          a.publishedAt ?? null,
          a.fetchedAt,
          a.status,
          a.reason ?? null,
          a.clusterId ?? null,
        ],
      );
    }
  }

  async findSimilarCluster(
    title: string,
    since: string,
    threshold: number,
  ): Promise<SimilarCluster | undefined> {
    // pg_trgm narrows the candidates (generously); titleSimilarity makes the final call.
    const rows = await this.sql.query<ClusterRow & { titles: string[] }>(
      `select c.id, c.primary_url_hash, c.primary_weight, c.first_seen_at, array_agg(a.title) as titles
         from public.clusters c
         join public.articles a on a.cluster_id = c.id
        where c.first_seen_at >= $2
        group by c.id
       having max(similarity(a.title, $1)) >= $3`,
      [title, since, threshold * 0.6],
    );
    let best: SimilarCluster | undefined;
    for (const row of rows) {
      const similarity = Math.max(0, ...row.titles.map((t) => titleSimilarity(title, t)));
      if (similarity >= threshold && (!best || similarity > best.similarity)) {
        best = { cluster: toCluster(row, row.titles), similarity };
      }
    }
    return best;
  }

  async saveCluster(cluster: ClusterRecord): Promise<void> {
    await this.sql.query(
      `insert into public.clusters (id, primary_url_hash, primary_weight, first_seen_at) values ($1, $2, $3, $4)
       on conflict (id) do update set primary_url_hash = excluded.primary_url_hash, primary_weight = excluded.primary_weight`,
      [cluster.id, cluster.primaryUrlHash, cluster.primaryWeight, cluster.firstSeenAt],
    );
  }

  async getCardByCluster(clusterId: string): Promise<CardRecord | undefined> {
    const [row] = await this.sql.query<CardRow>(
      'select * from public.cards where cluster_id = $1',
      [clusterId],
    );
    return row ? toCard(row) : undefined;
  }

  async saveCard(card: CardRecord): Promise<void> {
    await this.sql.query(
      `insert into public.cards (id, cluster_id, headline, summary, category, importance, source_name, source_url, image_url,
                                 published_at, hidden, created_at, llm_provider, prompt_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (id) do update set
         headline = excluded.headline, summary = excluded.summary, category = excluded.category,
         importance = excluded.importance, source_name = excluded.source_name, source_url = excluded.source_url,
         image_url = excluded.image_url, hidden = excluded.hidden`,
      [
        card.id,
        card.clusterId,
        card.headline,
        card.summary,
        card.category,
        card.importance,
        card.sourceName,
        card.sourceUrl,
        card.imageUrl,
        card.publishedAt,
        card.hidden,
        card.createdAt,
        card.llmProvider,
        card.promptVersion,
      ],
    );
  }

  async listVisibleCards(since: string): Promise<CardRecord[]> {
    const rows = await this.sql.query<CardRow>(
      'select * from public.cards where not hidden and published_at >= $1 order by published_at desc, id asc',
      [since],
    );
    return rows.map(toCard);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const [row] = await this.sql.query<{ value: unknown }>(
      'select value from public.pipeline_meta where key = $1',
      [key],
    );
    return row?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.sql.query(
      `insert into public.pipeline_meta (key, value, updated_at) values ($1, $2::text::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }

  async prune(before: string): Promise<number> {
    const deleted = await this.sql.query(
      `delete from public.articles a
        where a.fetched_at < $1
          and not exists (select 1 from public.cards c where c.cluster_id = a.cluster_id)
       returning a.url_hash`,
      [before],
    );
    await this.sql.query(
      `delete from public.clusters k
        where k.first_seen_at < $1 and not exists (select 1 from public.cards c where c.cluster_id = k.id)`,
      [before],
    );
    return deleted.length;
  }
}

interface SourceStateRow {
  etag: string | null;
  last_modified: string | null;
  last_ok_at: Date | string | null;
  last_error: string | null;
  consecutive_failures: number;
}

interface ClusterRow {
  id: string;
  primary_url_hash: string;
  primary_weight: number;
  first_seen_at: Date | string;
}

interface CardRow {
  id: string;
  cluster_id: string;
  headline: string;
  summary: string;
  category: CardRecord['category'];
  importance: number;
  source_name: string;
  source_url: string;
  image_url: string | null;
  published_at: Date | string;
  hidden: boolean;
  created_at: Date | string;
  llm_provider: string;
  prompt_version: string;
}

function toCluster(row: ClusterRow, titles: string[]): ClusterRecord {
  return {
    id: row.id,
    primaryUrlHash: row.primary_url_hash,
    primaryWeight: Number(row.primary_weight),
    firstSeenAt: iso(row.first_seen_at)!,
    titles,
  };
}

function toCard(row: CardRow): CardRecord {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    headline: row.headline,
    summary: row.summary,
    category: row.category,
    importance: Number(row.importance),
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    imageUrl: row.image_url,
    publishedAt: iso(row.published_at)!,
    hidden: row.hidden,
    createdAt: iso(row.created_at)!,
    llmProvider: row.llm_provider,
    promptVersion: row.prompt_version,
  };
}

/** Postgres drivers return timestamptz as Date (or string); the pipeline uses ISO 8601 UTC. */
function iso(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
