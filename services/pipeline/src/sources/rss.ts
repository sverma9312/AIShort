import { XMLParser } from 'fast-xml-parser';
import { htmlToText, truncate } from '../lib/text';
import { toIsoUtc } from '../lib/time';
import { toWebUrl } from '../lib/url';

export interface FeedItem {
  url: string;
  title: string;
  description?: string;
  publishedAt?: string;
  imageUrl?: string;
}

const DESCRIPTION_MAX_CHARS = 1_500;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  htmlEntities: true,
});

/** Parses RSS 2.0, RSS 1.0 (RDF) and Atom feeds. Items without a title or link are skipped. */
export function parseFeed(xml: string, baseUrl?: string): FeedItem[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml, true);
  } catch (error) {
    throw new Error(`Invalid XML: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }

  const rss = field(doc, 'rss');
  const rdf = field(doc, 'rdf:RDF');
  const atom = field(doc, 'feed');

  let items: (FeedItem | undefined)[];
  if (rss !== undefined) {
    items = asArray(field(field(rss, 'channel'), 'item')).map((n) => rssItem(n, baseUrl));
  } else if (rdf !== undefined) {
    items = asArray(field(rdf, 'item')).map((n) => rssItem(n, baseUrl));
  } else if (atom !== undefined) {
    items = asArray(field(atom, 'entry')).map((n) => atomEntry(n, baseUrl));
  } else {
    throw new Error('Unrecognized feed format (expected RSS or Atom)');
  }
  return items.filter((item): item is FeedItem => item !== undefined);
}

function rssItem(node: unknown, baseUrl?: string): FeedItem | undefined {
  const guid = field(node, 'guid');
  const guidIsLink = attr(guid, 'isPermaLink') !== 'false';
  const url =
    toWebUrl(text(field(node, 'link')), baseUrl) ??
    (guidIsLink ? toWebUrl(text(guid), baseUrl) : undefined);
  const title = htmlToText(text(field(node, 'title')));
  if (!url || !title) return undefined;

  const descriptionHtml = text(field(node, 'description')) || text(field(node, 'content:encoded'));
  return compact({
    url,
    title,
    description: descriptionHtml
      ? truncate(htmlToText(descriptionHtml), DESCRIPTION_MAX_CHARS)
      : undefined,
    publishedAt: toIsoUtc(text(field(node, 'pubDate')) || text(field(node, 'dc:date'))),
    imageUrl: imageOf(node, baseUrl),
  });
}

function atomEntry(node: unknown, baseUrl?: string): FeedItem | undefined {
  const links = asArray(field(node, 'link'));
  const alternate = links.find((l) => (attr(l, 'rel') ?? 'alternate') === 'alternate') ?? links[0];
  const url = toWebUrl(attr(alternate, 'href'), baseUrl);
  const title = htmlToText(text(field(node, 'title')));
  if (!url || !title) return undefined;

  const descriptionHtml = text(field(node, 'summary')) || text(field(node, 'content'));
  return compact({
    url,
    title,
    description: descriptionHtml
      ? truncate(htmlToText(descriptionHtml), DESCRIPTION_MAX_CHARS)
      : undefined,
    publishedAt: toIsoUtc(text(field(node, 'published')) || text(field(node, 'updated'))),
    imageUrl: imageOf(node, baseUrl),
  });
}

function imageOf(node: unknown, baseUrl?: string): string | undefined {
  for (const key of ['media:content', 'media:thumbnail']) {
    for (const media of asArray(field(node, key))) {
      const medium = attr(media, 'medium');
      const type = attr(media, 'type');
      if (medium && medium !== 'image') continue;
      if (type && !type.startsWith('image/')) continue;
      const url = toWebUrl(attr(media, 'url'), baseUrl);
      if (url) return url;
    }
  }
  for (const enclosure of asArray(field(node, 'enclosure'))) {
    if (attr(enclosure, 'type')?.startsWith('image/')) {
      const url = toWebUrl(attr(enclosure, 'url'), baseUrl);
      if (url) return url;
    }
  }
  return undefined;
}

// --- helpers for navigating untyped parser output ---

function field(node: unknown, key: string): unknown {
  return node !== null && typeof node === 'object'
    ? (node as Record<string, unknown>)[key]
    : undefined;
}

function attr(node: unknown, name: string): string | undefined {
  const value = field(node, `@${name}`);
  return typeof value === 'string' ? value : undefined;
}

function text(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  const inner = field(node, '#text');
  return typeof inner === 'string' || typeof inner === 'number' ? String(inner) : '';
}

function asArray(node: unknown): unknown[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
