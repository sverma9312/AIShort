import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTTP_FIXTURES_DIR } from '../testing';
import { parseListing } from './html';

const html = readFileSync(join(HTTP_FIXTURES_DIR, 'robotics-listing.html'), 'utf8');
const options = { linkPattern: '^/news/[a-z0-9-]+/?$', exclude: [], maxItems: 10 };

describe('parseListing', () => {
  it('keeps matching same-host article links in page order without duplicates', () => {
    expect(parseListing(html, 'https://robotics.example.com/news', options)).toEqual([
      {
        url: 'https://robotics.example.com/news/robot-hand',
        title: 'Research A robot hand that learns from video',
      },
      { url: 'https://robotics.example.com/news/old-post/', title: 'An old announcement' },
    ]);
  });

  it('honors exclude (with or without trailing slash) and maxItems', () => {
    const excluded = parseListing(html, 'https://robotics.example.com/news', {
      ...options,
      exclude: ['/news/old-post'],
    });
    expect(excluded.map((i) => i.url)).toEqual(['https://robotics.example.com/news/robot-hand']);

    const capped = parseListing(html, 'https://robotics.example.com/news', {
      ...options,
      maxItems: 1,
    });
    expect(capped).toHaveLength(1);
  });

  it('falls back to the URL slug when a link has no text', () => {
    const page = '<a href="/news/big-model-launch"><img src="x.png"></a>';
    expect(parseListing(page, 'https://a.example.com/news', options)[0]?.title).toBe(
      'Big model launch',
    );
  });
});
