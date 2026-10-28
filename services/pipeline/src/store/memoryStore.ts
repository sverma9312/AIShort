import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { titleSimilarity } from '../dedupe/similarity';
import type {
  ArticleRecord,
  CardRecord,
  ClusterRecord,
  SimilarCluster,
  SourceState,
  Store,
} from './types';

interface Snapshot {
  version: 1;
  meta?: Record<string, unknown>;
  sources: Record<string, SourceState>;
  articles: Record<string, ArticleRecord>;
  clusters: Record<string, ClusterRecord>;
  cards: Record<string, CardRecord>;
}

/**
 * In-memory Store, optionally saved to a JSON file so local runs remember what they processed.
 * Used for tests, the dry run and local live runs until Supabase arrives in Milestone 2.
 */
export class MemoryStore implements Store {
  private sources = new Map<string, SourceState>();
  private articles = new Map<string, ArticleRecord>();
  private clusters = new Map<string, ClusterRecord>();
  private cards = new Map<string, CardRecord>(); // keyed by clusterId
  private meta = new Map<string, unknown>();

  static async load(path: string): Promise<MemoryStore> {
    const store = new MemoryStore();
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return store;
      throw error;
    }
    const snapshot = JSON.parse(text) as Snapshot;
    if (snapshot.version !== 1) throw new Error(`Unsupported store snapshot version in ${path}`);
    store.sources = new Map(Object.entries(snapshot.sources));
    store.articles = new Map(Object.entries(snapshot.articles));
    store.clusters = new Map(Object.entries(snapshot.clusters));
    store.cards = new Map(Object.entries(snapshot.cards));
    store.meta = new Map(Object.entries(snapshot.meta ?? {}));
    return store;
  }

  /** Writes atomically (temp file + rename) so an interrupted run can't corrupt the state. */
  async save(path: string): Promise<void> {
    const snapshot: Snapshot = {
      version: 1,
      meta: Object.fromEntries(this.meta),
      sources: Object.fromEntries(this.sources),
      articles: Object.fromEntries(this.articles),
      clusters: Object.fromEntries(this.clusters),
      cards: Object.fromEntries(this.cards),
    };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.tmp`, JSON.stringify(snapshot));
    await rename(`${path}.tmp`, path);
  }

  getSourceState(sourceId: string): Promise<SourceState | undefined> {
    return Promise.resolve(this.sources.get(sourceId));
  }

  saveSourceState(sourceId: string, state: SourceState): Promise<void> {
    this.sources.set(sourceId, { ...state });
    return Promise.resolve();
  }

  findSeen(urlHashes: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(urlHashes.filter((hash) => this.articles.has(hash))));
  }

  saveArticles(articles: readonly ArticleRecord[]): Promise<void> {
    for (const article of articles) {
      this.articles.set(article.urlHash, { ...article });
      const cluster = article.clusterId ? this.clusters.get(article.clusterId) : undefined;
      if (cluster && !cluster.titles.includes(article.title)) cluster.titles.push(article.title);
    }
    return Promise.resolve();
  }

  findSimilarCluster(
    title: string,
    since: string,
    threshold: number,
  ): Promise<SimilarCluster | undefined> {
    let best: SimilarCluster | undefined;
    for (const cluster of this.clusters.values()) {
      if (cluster.firstSeenAt < since) continue;
      const similarity = Math.max(0, ...cluster.titles.map((t) => titleSimilarity(title, t)));
      if (similarity >= threshold && (!best || similarity > best.similarity))
        best = { cluster: { ...cluster }, similarity };
    }
    return Promise.resolve(best);
  }

  saveCluster(cluster: ClusterRecord): Promise<void> {
    // Titles come from the cluster's articles (as in SQL); saving a cluster never drops them.
    const titles = new Set([...(this.clusters.get(cluster.id)?.titles ?? []), ...cluster.titles]);
    this.clusters.set(cluster.id, { ...cluster, titles: [...titles] });
    return Promise.resolve();
  }

  getCardByCluster(clusterId: string): Promise<CardRecord | undefined> {
    const card = this.cards.get(clusterId);
    return Promise.resolve(card ? { ...card } : undefined);
  }

  saveCard(card: CardRecord): Promise<void> {
    this.cards.set(card.clusterId, { ...card });
    return Promise.resolve();
  }

  listVisibleCards(since: string): Promise<CardRecord[]> {
    return Promise.resolve(
      [...this.cards.values()]
        .filter((card) => !card.hidden && card.publishedAt >= since)
        .sort((a, b) =>
          a.publishedAt === b.publishedAt
            ? a.id.localeCompare(b.id)
            : a.publishedAt < b.publishedAt
              ? 1
              : -1,
        )
        .map((card) => ({ ...card })),
    );
  }

  getMeta<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(structuredClone(this.meta.get(key)) as T | undefined);
  }

  setMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, structuredClone(value));
    return Promise.resolve();
  }

  prune(before: string): Promise<number> {
    const carded = new Set([...this.cards.values()].map((c) => c.clusterId));
    let removed = 0;
    for (const [hash, article] of this.articles) {
      if (article.fetchedAt < before && !(article.clusterId && carded.has(article.clusterId))) {
        this.articles.delete(hash);
        removed++;
      }
    }
    for (const [id, cluster] of this.clusters) {
      if (cluster.firstSeenAt < before && !carded.has(id)) this.clusters.delete(id);
    }
    return Promise.resolve(removed);
  }

  /** Test/editor helper: everything recorded for one article. */
  getArticle(urlHash: string): ArticleRecord | undefined {
    return this.articles.get(urlHash);
  }

  /** Editor helper (Supabase Studio does this in production). */
  setHidden(clusterId: string, hidden: boolean): void {
    const card = this.cards.get(clusterId);
    if (card) card.hidden = hidden;
  }
}
