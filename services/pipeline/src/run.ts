import { CardSchema } from '@aishort/shared';
import { groupBySimilarity } from './dedupe/similarity';
import type { ArticleFetcher } from './extract/fetchArticle';
import { mapLimit } from './lib/concurrency';
import type { Logger } from './lib/log';
import { hoursBefore } from './lib/time';
import type { Classification, Classifier } from './llm/classify';
import { SUMMARIZE_PROMPT_VERSION } from './llm/prompts';
import type { Summarizer } from './llm/summarize';
import { AllProvidersFailedError } from './llm/types';
import { canonicalUrl, urlHash } from './normalize/canonicalUrl';
import { checkAge, prefilter } from './normalize/prefilter';
import type { Source } from './sources/config';
import { fetchAllSources, type SourceFetchResult } from './sources/fetchSource';
import type { HttpClient } from './sources/http';
import type {
  ArticleRecord,
  ArticleStatus,
  ClusterRecord,
  SourceState,
  Store,
} from './store/types';
import type { RawItem } from './types';

export interface PipelineDeps {
  sources: readonly Source[];
  http: HttpClient;
  articles: ArticleFetcher;
  store: Store;
  classifier: Classifier;
  summarizer: Summarizer;
  now: Date;
  log: Logger;
}

export interface PipelineOptions {
  /** Items published longer ago than this are ignored. */
  maxAgeHours: number;
  /** New stories are compared with clusters first seen within this window. */
  dedupeWindowHours: number;
  /** Title similarity (0–1) at which two articles count as the same story. */
  similarityThreshold: number;
  /** Stories the classifier rates below this are not published. */
  minImportance: number;
  /** Upper bound on new items processed per run (bounds LLM usage); the rest wait. */
  maxCandidates: number;
  classifyBatchSize: number;
  extractConcurrency: number;
  /** Articles with less text than this (after extraction) can't be summarized. */
  minTextChars: number;
  /** Feed descriptions at least this long (e.g. paper abstracts) are used without fetching. */
  skipExtractChars: number;
}

export const DEFAULT_OPTIONS: PipelineOptions = {
  maxAgeHours: 48,
  dedupeWindowHours: 48,
  similarityThreshold: 0.5,
  minImportance: 4,
  maxCandidates: 60,
  classifyBatchSize: 20,
  extractConcurrency: 4,
  minTextChars: 150,
  skipExtractChars: 600,
};

export interface NewCard {
  id: string;
  headline: string;
  sourceName: string;
  category: string;
  importance: number;
  provider: string;
}

export interface RunReport {
  startedAt: string;
  sources: {
    id: string;
    status: SourceFetchResult['status'];
    items: number;
    error?: string;
    /** Failures in a row including this run (errors only). */
    consecutiveFailures?: number;
  }[];
  /** How many items reached each stage. */
  counts: {
    fetched: number;
    unseen: number;
    extracted: number;
    stories: number;
    classified: number;
    cards: number;
  };
  /** Why items were not published, by reason. */
  outcomes: Record<string, number>;
  /** Items left unprocessed for a later run (over the per-run cap or LLM unavailable). */
  deferred: number;
  llmUnavailable: boolean;
  newCards: NewCard[];
}

interface Candidate {
  item: RawItem;
  source: Source;
  canonical: string;
  hash: string;
}

interface Prepared extends Candidate {
  title: string;
  text: string;
  imageUrl?: string;
  publishedAt: string;
}

/**
 * One ingestion run: fetch → normalize → prefilter → extract → dedupe → classify → summarize.
 * Every article is recorded in the store once its outcome is final, so it is never processed
 * twice. When no LLM is reachable, affected stories are left unrecorded and retried next run.
 */
export async function runPipeline(
  deps: PipelineDeps,
  overrides: Partial<PipelineOptions> = {},
): Promise<RunReport> {
  const options = { ...DEFAULT_OPTIONS, ...overrides };
  const { store, log, now } = deps;
  const nowIso = now.toISOString();
  const report: RunReport = {
    startedAt: nowIso,
    sources: [],
    counts: { fetched: 0, unseen: 0, extracted: 0, stories: 0, classified: 0, cards: 0 },
    outcomes: {},
    deferred: 0,
    llmUnavailable: false,
    newCards: [],
  };
  const outcome = (reason: string, n = 1) => {
    report.outcomes[reason] = (report.outcomes[reason] ?? 0) + n;
  };
  const record = (
    members: readonly (Candidate & { title?: string; publishedAt?: string })[],
    status: ArticleStatus,
    extra: { reason?: string; clusterId?: string } = {},
  ) =>
    store.saveArticles(
      members.map((m): ArticleRecord => ({
        urlHash: m.hash,
        urlCanonical: m.canonical,
        sourceId: m.source.id,
        title: m.title ?? m.item.title,
        fetchedAt: nowIso,
        status,
        ...((m.publishedAt ?? m.item.publishedAt)
          ? { publishedAt: m.publishedAt ?? m.item.publishedAt }
          : {}),
        ...(extra.reason ? { reason: extra.reason } : {}),
        ...(extra.clusterId ? { clusterId: extra.clusterId } : {}),
      })),
    );

  // 1. Fetch every enabled source, using stored cache validators.
  const sources = deps.sources.filter((s) => s.enabled);
  const states = new Map<string, SourceState | undefined>();
  for (const source of sources) states.set(source.id, await store.getSourceState(source.id));

  const results = await fetchAllSources(sources, {
    http: deps.http,
    now,
    validatorsFor: (id) => {
      const state = states.get(id);
      return state
        ? {
            ...(state.etag ? { etag: state.etag } : {}),
            ...(state.lastModified ? { lastModified: state.lastModified } : {}),
          }
        : undefined;
    },
  });

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const fetched: { item: RawItem; source: Source; firstRun: boolean }[] = [];
  for (const result of results) {
    const previous = states.get(result.sourceId);
    const source = sourceById.get(result.sourceId)!;
    if (result.status === 'error') {
      log.warn('source failed', { source: result.sourceId, error: result.error });
      const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
      report.sources.push({
        id: result.sourceId,
        status: 'error',
        items: 0,
        error: result.error,
        consecutiveFailures,
      });
      await store.saveSourceState(result.sourceId, {
        ...previous,
        lastError: result.error,
        consecutiveFailures,
      });
      continue;
    }
    const items = result.status === 'ok' ? result.items : [];
    report.sources.push({ id: result.sourceId, status: result.status, items: items.length });
    const firstRun = !previous?.lastOkAt;
    await store.saveSourceState(result.sourceId, {
      ...(result.status === 'ok'
        ? result.validators
        : { etag: previous?.etag, lastModified: previous?.lastModified }),
      lastOkAt: nowIso,
      consecutiveFailures: 0,
    });
    for (const item of items) fetched.push({ item, source, firstRun });
  }
  report.counts.fetched = fetched.length;

  // 2. Normalize, prefilter, and collapse URLs that appear in several sources (keep the heaviest).
  const byHash = new Map<string, Candidate & { firstRun: boolean }>();
  for (const { item, source, firstRun } of fetched) {
    let canonical: string;
    try {
      canonical = canonicalUrl(item.url);
    } catch {
      outcome('invalid-url');
      continue;
    }
    const filter = prefilter(item, source, { now, maxAgeHours: options.maxAgeHours });
    if (!filter.pass) {
      outcome(filter.reason);
      continue;
    }
    const hash = urlHash(canonical);
    const existing = byHash.get(hash);
    if (existing && existing.source.weight >= source.weight) {
      outcome('same-url');
      continue;
    }
    if (existing) outcome('same-url');
    byHash.set(hash, { item, source, canonical, hash, firstRun });
  }

  const seen = await store.findSeen([...byHash.keys()]);
  let candidates = [...byHash.values()].filter((c) => !seen.has(c.hash));
  outcome('already-seen', byHash.size - candidates.length);

  // A listing page has no dates, so on a source's first successful run everything on it is
  // recorded as a baseline instead of being treated as new.
  const baseline = candidates.filter((c) => c.firstRun && c.source.kind === 'html');
  if (baseline.length) {
    await record(baseline, 'dropped', { reason: 'baseline' });
    outcome('baseline', baseline.length);
    candidates = candidates.filter((c) => !baseline.includes(c));
  }
  report.counts.unseen = candidates.length;

  // 3. Heaviest sources and newest items first, capped per run.
  candidates.sort(
    (a, b) =>
      b.source.weight - a.source.weight ||
      (b.item.publishedAt ?? '').localeCompare(a.item.publishedAt ?? ''),
  );
  report.deferred += Math.max(0, candidates.length - options.maxCandidates);
  candidates = candidates.slice(0, options.maxCandidates);

  // 4. Extract article text (feed descriptions that are already long enough are used as-is).
  const extracted = await mapLimit(
    candidates,
    options.extractConcurrency,
    async (c): Promise<Prepared | { candidate: Candidate; reason: string }> => {
      const description = c.item.description ?? '';
      const needsFetch = c.item.titleIsProvisional || description.length < options.skipExtractChars;
      const fetchedArticle = needsFetch ? await deps.articles.fetch(c.canonical) : undefined;
      const article = fetchedArticle?.status === 'ok' ? fetchedArticle.article : undefined;
      if (fetchedArticle && fetchedArticle.status !== 'ok') {
        log.debug('article not extracted', {
          url: c.canonical,
          result: fetchedArticle.status === 'error' ? fetchedArticle.error : fetchedArticle.reason,
        });
      }

      // Undated items (listing pages) were first seen now; the baseline above makes that safe.
      const publishedAt = c.item.publishedAt ?? article?.publishedAt ?? nowIso;
      const tooOld = checkAge(publishedAt, { now, maxAgeHours: options.maxAgeHours });
      if (tooOld) return { candidate: c, reason: tooOld.reason };

      const text = article?.text || description;
      if (text.length < options.minTextChars) return { candidate: c, reason: 'no-text' };

      const imageUrl = c.item.imageUrl ?? article?.imageUrl;
      return {
        ...c,
        title: (c.item.titleIsProvisional && article?.title) || c.item.title,
        text,
        publishedAt,
        ...(imageUrl ? { imageUrl } : {}),
      };
    },
  );

  const prepared: Prepared[] = [];
  for (const result of extracted) {
    if ('reason' in result) {
      await record([result.candidate], 'dropped', { reason: result.reason });
      outcome(result.reason);
    } else {
      prepared.push(result);
    }
  }
  report.counts.extracted = prepared.length;

  // 5. Group articles about the same story, then match groups against recent clusters.
  const since = hoursBefore(now, options.dedupeWindowHours).toISOString();
  const pending: { id: string; members: Prepared[] }[] = [];
  for (const members of groupBySimilarity(prepared, (p) => p.title, options.similarityThreshold)) {
    const primary = members[0]!;
    const match = await store.findSimilarCluster(primary.title, since, options.similarityThreshold);
    if (!match) {
      pending.push({ id: `k_${primary.hash.slice(0, 16)}`, members });
      continue;
    }
    await record(members, 'duplicate', { clusterId: match.cluster.id });
    outcome('duplicate', members.length);
    if (primary.source.weight > match.cluster.primaryWeight) {
      await store.saveCluster({
        ...match.cluster,
        primaryUrlHash: primary.hash,
        primaryWeight: primary.source.weight,
      });
      const card = await store.getCardByCluster(match.cluster.id);
      if (card) {
        await store.saveCard({
          ...card,
          sourceName: primary.source.name,
          sourceUrl: primary.canonical,
        });
        log.info('card attribution moved to a more authoritative source', {
          card: card.id,
          source: primary.source.id,
        });
      }
    }
  }
  report.counts.stories = pending.length;
  outcome(
    'same-story',
    pending.reduce((n, g) => n + g.members.length - 1, 0),
  );

  const saveStory = async (
    story: (typeof pending)[number],
    status: ArticleStatus,
    reason?: string,
  ) => {
    const [primary, ...rest] = story.members as [Prepared, ...Prepared[]];
    const cluster: ClusterRecord = {
      id: story.id,
      primaryUrlHash: primary.hash,
      primaryWeight: primary.source.weight,
      firstSeenAt: nowIso,
      titles: [],
    };
    await store.saveCluster(cluster);
    await record([primary], status, { clusterId: story.id, ...(reason ? { reason } : {}) });
    if (rest.length) await record(rest, 'duplicate', { clusterId: story.id });
  };

  // 6. Classify new stories in batches.
  const classifications = new Map<string, Classification>();
  for (let i = 0; i < pending.length && !report.llmUnavailable; i += options.classifyBatchSize) {
    const batch = pending.slice(i, i + options.classifyBatchSize);
    try {
      const result = await deps.classifier.classify(
        batch.map(({ id, members: [primary] }) => ({
          id,
          title: primary!.title,
          excerpt: primary!.text,
          sourceName: primary!.source.name,
          ...(primary!.source.categoryHint ? { categoryHint: primary!.source.categoryHint } : {}),
        })),
      );
      for (const [id, classification] of result) classifications.set(id, classification);
    } catch (error) {
      if (!(error instanceof AllProvidersFailedError)) throw error;
      log.error('LLM unavailable during classification; stories deferred to the next run', {
        error: error.message,
      });
      report.llmUnavailable = true;
    }
  }

  // 7. Summarize relevant stories into cards.
  for (const story of pending) {
    const classification = classifications.get(story.id);
    if (!classification || report.llmUnavailable) {
      report.deferred += story.members.length;
      continue;
    }
    report.counts.classified++;
    if (!classification.isAiNews || classification.importance < options.minImportance) {
      const reason = classification.isAiNews ? 'low-importance' : 'not-ai-news';
      await saveStory(story, 'rejected', reason);
      outcome(reason);
      continue;
    }

    const primary = story.members[0]!;
    let summary: Awaited<ReturnType<Summarizer['summarize']>>;
    try {
      summary = await deps.summarizer.summarize({
        title: primary.title,
        sourceName: primary.source.name,
        text: primary.text,
      });
    } catch (error) {
      if (!(error instanceof AllProvidersFailedError)) throw error;
      log.error('LLM unavailable during summarization; stories deferred to the next run', {
        error: error.message,
      });
      report.llmUnavailable = true;
      report.deferred += story.members.length;
      continue;
    }
    if (!summary.ok) {
      log.warn('summary rejected by validation', {
        url: primary.canonical,
        issues: summary.issues,
      });
      await saveStory(story, 'dropped', 'invalid-summary');
      outcome('invalid-summary');
      continue;
    }

    const card = CardSchema.safeParse({
      id: `c_${primary.hash.slice(0, 16)}`,
      headline: summary.headline,
      summary: summary.summary,
      category: classification.category,
      importance: classification.importance,
      sourceName: primary.source.name,
      sourceUrl: primary.canonical,
      imageUrl: primary.imageUrl ?? null,
      publishedAt: primary.publishedAt,
    });
    if (!card.success) {
      log.warn('card failed schema validation', {
        url: primary.canonical,
        issue: card.error.issues[0]?.message,
      });
      await saveStory(story, 'dropped', 'invalid-card');
      outcome('invalid-card');
      continue;
    }

    await saveStory(story, 'carded');
    await store.saveCard({
      ...card.data,
      clusterId: story.id,
      hidden: false,
      createdAt: nowIso,
      llmProvider: summary.provider,
      promptVersion: SUMMARIZE_PROMPT_VERSION,
    });
    report.counts.cards++;
    report.newCards.push({
      id: card.data.id,
      headline: card.data.headline,
      sourceName: card.data.sourceName,
      category: card.data.category,
      importance: card.data.importance,
      provider: summary.provider,
    });
  }

  return report;
}
