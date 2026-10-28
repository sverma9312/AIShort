import { describe, expect, it } from 'vitest';
import type { RunReport } from '../run';
import { alertsFor, sendDiscordAlert, stepSummary } from './alerts';

const report = (overrides: Partial<RunReport> = {}): RunReport => ({
  startedAt: '2026-10-28T10:00:00.000Z',
  sources: [{ id: 'lab', status: 'ok', items: 3 }],
  counts: { fetched: 3, unseen: 1, extracted: 1, stories: 1, classified: 1, cards: 1 },
  outcomes: {},
  deferred: 0,
  llmUnavailable: false,
  newCards: [],
  ...overrides,
});

describe('alertsFor', () => {
  it('is quiet for a healthy run', () => {
    expect(alertsFor(report())).toEqual([]);
  });

  it('alerts once when a source reaches 3 failures in a row', () => {
    const failing = (n: number) =>
      report({
        sources: [
          { id: 'lab', status: 'ok', items: 1 },
          { id: 'press', status: 'error', items: 0, error: 'HTTP 503', consecutiveFailures: n },
        ],
      });
    expect(alertsFor(failing(2))).toEqual([]);
    expect(alertsFor(failing(3))).toEqual(['Source `press` has failed 3 runs in a row: HTTP 503']);
    expect(alertsFor(failing(4))).toEqual([]);
  });

  it('alerts when every source fails or the LLM is down', () => {
    const alerts = alertsFor(
      report({
        sources: [{ id: 'a', status: 'error', items: 0, consecutiveFailures: 1 }],
        llmUnavailable: true,
        deferred: 7,
      }),
    );
    expect(alerts).toHaveLength(2);
    expect(alerts[1]).toContain('7 items deferred');
  });
});

describe('sendDiscordAlert', () => {
  it('posts without mentions and never throws', async () => {
    const bodies: unknown[] = [];
    const ok = await sendDiscordAlert(
      'https://discord.example.com/hook',
      ['boom'],
      'https://run',
      (_u, init) => {
        bodies.push(JSON.parse(init?.body as string));
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    );
    expect(ok).toBe(true);
    expect(bodies[0]).toEqual({
      content: '**AIShort pipeline** — <https://run>\n• boom',
      allowed_mentions: { parse: [] },
    });
    expect(
      await sendDiscordAlert('https://x', ['a'], undefined, () =>
        Promise.reject(new Error('down')),
      ),
    ).toBe(false);
  });

  it('does nothing without alerts', async () => {
    expect(
      await sendDiscordAlert('https://x', [], undefined, () => Promise.reject(new Error('called'))),
    ).toBe(true);
  });
});

describe('stepSummary', () => {
  it('renders alerts and the report', () => {
    expect(stepSummary('Sources 1/1 ok', ['x'])).toContain('### ⚠️ Alerts\n\n- x');
  });
});
