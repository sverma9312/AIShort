import { titleSimilarity } from '../dedupe/similarity';
import type { FetchFn } from '../sources/http';
import type {
  ArticleRecord,
  CardRecord,
  ClusterRecord,
  SimilarCluster,
  SourceState,
  Store,
} from './types';

export interface SupabaseOptions {
  url: string;
  /** Service-role key: bypasses RLS. Only ever used by the pipeline (GitHub Secret). */
  serviceRoleKey: string;
  fetch?: FetchFn;
}

type Row = Record<string, unknown>;

/** Store backed by Supabase Postgres via PostgREST (schema: supabase/migrations). */
export class SupabaseStore implements Store {
  private readonly base: string;
  private readonly fetchFn: FetchFn;

  constructor(private readonly options: SupabaseOptions) {
    this.base = `${options.url.replace(/\/+$/, '')}/rest/v1`;
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  }

  protected async request<T = Row[]>(
    method: string,
    path: string,
    body?: unknown,
    prefer?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      apikey: this.options.serviceRoleKey,
      Authorization: `Bearer ${this.options.serviceRoleKey}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers['Prefer'] = prefer;
    const response = await this.fetchFn(`${this.base}/${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `Supabase ${method} ${path.split('?')[0]} failed: HTTP ${response.status} ${text.slice(0, 200)}`,
      );
    return (text ? JSON.parse(text) : []) as T;
  }

  protected upsert(table: string, rows: Row[], onConflict: string): Promise<unknown> {
    if (rows.length === 0) return Promise.resolve();
    return this.request(
      'POST',
      `${table}?on_conflict=${onConflict}`,
      rows,
      'resolution=merge-duplicates,return=minimal',
    );
  }

  async getSourceState(sourceId: string): Promise<SourceState | undefined> {
    const [row] = await this.request('GET', `source_state?source_id=eq.${enc(sourceId)}&select=*`);
    return row
      ? (compact({
          etag: row['etag'],
          lastModified: row['last_modified'],
          lastOkAt: iso(row['last_ok_at']),
          lastError: row['last_error'],
          consecutiveFailures: Number(row['consecutive_failures'] ?? 0),
        }) as unknown as SourceState)
      : undefined;
  }

  async saveSourceState(sourceId: string, state: SourceState): Promise<void> {
    await this.upsert(
      'source_state',
      [
        {
          source_id: sourceId,
          etag: state.etag ?? null,
          last_modified: state.lastModified ?? null,
          last_ok_at: state.lastOkAt ?? null,
          last_error: state.lastError ?? null,
          consecutive_failures: state.consecutiveFailures,
        },
      ],
      'source_id',
    );
  }

  async findSeen(urlHashes: readonly string[]): Promise<Set<string>> {
    const seen = new Set<string>();
    for (let i = 0; i < urlHashes.length; i += 100) {
      const chunk = urlHashes.slice(i, i + 100);
      const rows = await this.request(
        'GET',
        `articles?select=url_hash&url_hash=in.(${chunk.map(enc).join(',')})`,
      );
      for (const row of rows) seen.add(String(row['url_hash']));
    }
    return seen;
  }

  async saveArticles(articles: readonly ArticleRecord[]): Promise<void> {
    await this.upsert(
      'articles',
      articles.map((a) => ({
        url_hash: a.urlHash,
        url_canonical: a.urlCanonical,
        source_id: a.sourceId,
        title: a.title,
        published_at: a.publishedAt ?? null,
        fetched_at: a.fetchedAt,
        status: a.status,
        reason: a.reason ?? null,
        cluster_id: a.clusterId ?? null,
      })),
      'url_hash',
    );
  }

  async findSimilarCluster(
    title: string,
    since: string,
    threshold: number,
  ): Promise<SimilarCluster | undefined> {
    // pg_trgm narrows the candidates; the pipeline's own similarity (with the number guard) decides.
    const candidates = await this.request<Row[]>('POST', 'rpc/similar_clusters', {
      query: title,
      since,
      min_similarity: Math.max(0.1, threshold - 0.2),
    });
    const best = new Map<string, { score: number; titles: string[] }>();
    for (const row of candidates) {
      const id = String(row['cluster_id']);
      const t = String(row['title']);
      const entry = best.get(id) ?? { score: 0, titles: [] };
      entry.score = Math.max(entry.score, titleSimilarity(title, t));
      entry.titles.push(t);
      best.set(id, entry);
    }
    const [winner] = [...best]
      .filter(([, e]) => e.score >= threshold)
      .sort(([, a], [, b]) => b.score - a.score);
    if (!winner) return undefined;
    const [row] = await this.request('GET', `clusters?id=eq.${enc(winner[0])}&select=*`);
    if (!row) return undefined;
    return {
      similarity: winner[1].score,
      cluster: {
        id: String(row['id']),
        primaryUrlHash: String(row['primary_url_hash']),
        primaryWeight: Number(row['primary_weight']),
        firstSeenAt: iso(row['first_seen_at'])!,
        titles: winner[1].titles,
      },
    };
  }

  async saveCluster(cluster: ClusterRecord): Promise<void> {
    await this.upsert(
      'clusters',
      [
        {
          id: cluster.id,
          primary_url_hash: cluster.primaryUrlHash,
          primary_weight: cluster.primaryWeight,
          first_seen_at: cluster.firstSeenAt,
        },
      ],
      'id',
    );
  }

  async getCardByCluster(clusterId: string): Promise<CardRecord | undefined> {
    const [row] = await this.request('GET', `cards?cluster_id=eq.${enc(clusterId)}&select=*`);
    return row ? toCard(row) : undefined;
  }

  async saveCard(card: CardRecord): Promise<void> {
    await this.upsert(
      'cards',
      [
        {
          id: card.id,
          cluster_id: card.clusterId,
          headline: card.headline,
          summary: card.summary,
          category: card.category,
          importance: card.importance,
          source_name: card.sourceName,
          source_url: card.sourceUrl,
          image_url: card.imageUrl,
          published_at: card.publishedAt,
          hidden: card.hidden,
          created_at: card.createdAt,
          llm_provider: card.llmProvider,
          prompt_version: card.promptVersion,
        },
      ],
      'id',
    );
  }

  async listVisibleCards(since: string): Promise<CardRecord[]> {
    const rows = await this.request(
      'GET',
      `cards?select=*&hidden=is.false&published_at=gte.${enc(since)}&order=published_at.desc,id.asc&limit=2000`,
    );
    return rows.map(toCard);
  }
}

function toCard(row: Row): CardRecord {
  return {
    id: String(row['id']),
    clusterId: String(row['cluster_id']),
    headline: String(row['headline']),
    summary: String(row['summary']),
    category: row['category'] as CardRecord['category'],
    importance: Number(row['importance']),
    sourceName: String(row['source_name']),
    sourceUrl: String(row['source_url']),
    imageUrl: (row['image_url'] as string | null) ?? null,
    publishedAt: iso(row['published_at'])!,
    hidden: Boolean(row['hidden']),
    createdAt: iso(row['created_at'])!,
    llmProvider: String(row['llm_provider']),
    promptVersion: String(row['prompt_version']),
  };
}

/** Postgres returns "2026-10-28T08:00:00+00:00"; the feed contract needs "…Z". */
export function iso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function compact(obj: Row): Row {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}
