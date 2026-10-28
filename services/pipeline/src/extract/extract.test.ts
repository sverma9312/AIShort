import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTTP_FIXTURES_DIR } from '../testing';
import { extractArticle } from './extract';

const fixture = (name: string) => readFileSync(join(HTTP_FIXTURES_DIR, name), 'utf8');

describe('extractArticle', () => {
  it.each([
    'nova-2.html',
    'safety-evals.html',
    'acme-robotics.html',
    'robot-hand.html',
    'old-post.html',
  ])('extracts %s without navigation, cookie banners or footers', (name) => {
    const { text } = extractArticle(fixture(name), 'https://lab.example.com/news/x');
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(/cookies|All rights reserved|Careers|Privacy · Terms/);
  });

  it('keeps paragraphs separate', () => {
    const { text } = extractArticle(fixture('nova-2.html'), 'https://lab.example.com/news/nova-2');
    expect(text).toContain(
      'open-weight reasoning model with 70 billion parameters.\n\nNova-2 scores 82 percent',
    );
    expect(text).not.toMatch(/Nova-2 Today/);
  });

  it('drops author bio paragraphs', () => {
    const body = Array.from(
      { length: 4 },
      (_, i) =>
        `<p>Paragraph ${i} about a new AI model with enough words to count as article text for extraction.</p>`,
    ).join('');
    const bio = '<p>Jane Doe-Smith is a senior news writer who covers AI and consumer tech.</p>';
    const { text } = extractArticle(
      `<html><body><article>${bio}${body}</article></body></html>`,
      'https://a.example.com/x',
    );
    expect(text).not.toContain('Jane Doe-Smith');
    expect(text).toContain('Paragraph 0');
  });

  it('keeps sentences that merely mention a writer', () => {
    const body = Array.from(
      { length: 4 },
      (_, i) =>
        `<p>Paragraph ${i} about a new AI model with enough words to count as article text for extraction.</p>`,
    ).join('');
    const prose = '<p>The model is a better writer than its predecessor, the company said.</p>';
    const { text } = extractArticle(
      `<html><body><article>${prose}${body}</article></body></html>`,
      'https://a.example.com/x',
    );
    expect(text).toContain('better writer');
  });

  it('removes consent and newsletter blocks by class or id', () => {
    const body = Array.from(
      { length: 4 },
      (_, i) =>
        `<p>Paragraph ${i} about a new AI model with enough words to count as article text for extraction.</p>`,
    ).join('');
    const html = `<html><body><div id="gdpr-consent">Accept tracking?</div><article>${body}<div class="newsletter-signup">Sign up now</div></article></body></html>`;
    const { text } = extractArticle(html, 'https://a.example.com/x');
    expect(text).toContain('Paragraph 3');
    expect(text).not.toMatch(/Accept tracking|Sign up now/);
  });

  it('reads Open Graph metadata and resolves relative image URLs', () => {
    const article = extractArticle(fixture('nova-2.html'), 'https://lab.example.com/news/nova-2');
    expect(article).toMatchObject({
      title: 'Example AI Lab introduces Nova-2',
      imageUrl: 'https://lab.example.com/images/nova-2-social.png',
      publishedAt: '2026-10-28T08:00:00.000Z',
    });
  });

  it('falls back to JSON-LD for title, date and image', () => {
    const article = extractArticle(
      fixture('acme-robotics.html'),
      'https://news.example.org/2026/10/27/acme-robotics-funding',
    );
    expect(article).toMatchObject({
      title: 'Acme Robotics raises $40M',
      imageUrl: 'https://news.example.org/images/acme.jpg',
      publishedAt: '2026-10-27T20:00:00.000Z',
    });
  });

  it('falls back to the <h1> title when there is no metadata', () => {
    const article = extractArticle(
      fixture('safety-evals.html'),
      'https://lab.example.com/news/safety-evals',
    );
    expect(article.title).toBe('Our approach to model safety evaluations');
    expect(article).not.toHaveProperty('imageUrl');
  });

  it('truncates long text at a word boundary', () => {
    const { text } = extractArticle(fixture('nova-2.html'), 'https://lab.example.com/', {
      maxChars: 120,
    });
    expect(text.length).toBeLessThanOrEqual(120);
    expect(text.endsWith('…')).toBe(true);
  });

  it('returns empty text for pages without enough article content', () => {
    const html = `<html><head><meta property="og:title" content="Paywalled"></head>
      <body><p>Subscribe to continue reading.</p></body></html>`;
    expect(extractArticle(html, 'https://a.example.com/x')).toEqual({
      text: '',
      title: 'Paywalled',
    });
  });

  it('ignores non-http image URLs and invalid dates', () => {
    const html = `<html><head>
      <meta property="og:image" content="javascript:alert(1)">
      <meta property="article:published_time" content="yesterday">
      </head><body><h1>T</h1></body></html>`;
    const article = extractArticle(html, 'https://a.example.com/x');
    expect(article).not.toHaveProperty('imageUrl');
    expect(article).not.toHaveProperty('publishedAt');
  });

  it('survives malformed JSON-LD', () => {
    const html = `<html><head><script type="application/ld+json">{not json</script></head><body><h1>T</h1></body></html>`;
    expect(extractArticle(html, 'https://a.example.com/x').title).toBe('T');
  });
});
