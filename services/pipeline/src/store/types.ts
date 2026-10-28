import type { Card } from '@aishort/shared';

export interface SourceState {
  etag?: string;
  lastModified?: string;
  lastOkAt?: string;
  lastError?: string;
  consecutiveFailures: number;
}

/**
 * carded:    primary article of a published card
 * duplicate: same story as an existing cluster
 * rejected:  classified as not AI news / not important enough
 * dropped:   not usable (too old, no text, invalid summary, baseline of a new listing source)
 */
export type ArticleStatus = 'carded' | 'duplicate' | 'rejected' | 'dropped';

/** A processed article. Its urlHash is never processed again. */
export interface ArticleRecord {
  urlHash: string;
  urlCanonical: string;
  sourceId: string;
  title: string;
  publishedAt?: string;
  fetchedAt: string;
  status: ArticleStatus;
  reason?: string;
  clusterId?: string;
}

/** One real-world story, possibly covered by several articles. */
export interface ClusterRecord {
  id: string;
  primaryUrlHash: string;
  /** Weight of the primary article's source; a heavier source takes over attribution. */
  primaryWeight: number;
  firstSeenAt: string;
  /** Titles of every article in the cluster, used for similarity matching. */
  titles: string[];
}

export interface CardRecord extends Card {
  clusterId: string;
  /** Editor kill switch: hidden cards are never published. */
  hidden: boolean;
  createdAt: string;
  llmProvider: string;
  promptVersion: string;
}

export interface SimilarCluster {
  cluster: ClusterRecord;
  similarity: number;
}

/** Persistence used by the pipeline. In-memory/JSON now; Supabase implements it in Milestone 2. */
export interface Store {
  getSourceState(sourceId: string): Promise<SourceState | undefined>;
  saveSourceState(sourceId: string, state: SourceState): Promise<void>;

  /** Returns the subset of `urlHashes` that were already processed. */
  findSeen(urlHashes: readonly string[]): Promise<Set<string>>;
  saveArticles(articles: readonly ArticleRecord[]): Promise<void>;

  /** Most similar cluster first seen at or after `since`, if its similarity is ≥ `threshold`. */
  findSimilarCluster(
    title: string,
    since: string,
    threshold: number,
  ): Promise<SimilarCluster | undefined>;
  saveCluster(cluster: ClusterRecord): Promise<void>;

  getCardByCluster(clusterId: string): Promise<CardRecord | undefined>;
  saveCard(card: CardRecord): Promise<void>;
  /** Visible (not hidden) cards published at or after `since`, newest first. */
  listVisibleCards(since: string): Promise<CardRecord[]>;
}
