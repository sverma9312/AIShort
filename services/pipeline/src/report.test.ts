import { describe, expect, it } from 'vitest';
import { formatMarkdownReport, formatReport } from './report';
import type { RunReport } from './run';

const report: RunReport = {
  startedAt: '2026-10-28T10:00:00.000Z',
  sources: [
    { id: 'lab', status: 'ok', items: 3, consecutiveFailures: 0 },
    { id: 'press', status: 'error', items: 0, error: 'HTTP 503 | gateway', consecutiveFailures: 2 },
  ],
  counts: { fetched: 3, unseen: 2, extracted: 2, stories: 2, classified: 2, cards: 1 },
  outcomes: { 'too-old': 1, duplicate: 0 },
  deferred: 0,
  llmUnavailable: false,
  newCards: [
    {
      id: 'c1',
      headline: 'Lab | ships model',
      sourceName: 'Lab',
      category: 'models',
      importance: 8,
      provider: 'gemini',
    },
  ],
};

describe('formatReport', () => {
  it('summarizes a run as plain text', () => {
    const text = formatReport(report, { gemini: { calls: 3, failures: 0 } });
    expect(text).toContain('Sources   1/2 ok (failed: press)');
    expect(text).toContain('[8] models');
  });
});

describe('formatMarkdownReport', () => {
  it('renders tables and escapes pipes in cells', () => {
    const md = formatMarkdownReport(report);
    expect(md).toContain('## AIShort pipeline — 1 new card');
    expect(md).toContain('| press | 2 | HTTP 503 \\| gateway |');
    expect(md).toContain('| 8 | models | Lab \\| ships model | Lab |');
    expect(md).toContain('| too-old | 1 |');
    expect(md).not.toContain('| duplicate | 0 |');
  });
});
