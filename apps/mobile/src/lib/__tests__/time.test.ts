import { relativeTime } from '../time';

describe('relativeTime', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  it.each([
    ['2026-10-28T11:59:30Z', 'just now'],
    ['2026-10-28T11:55:00Z', '5m ago'],
    ['2026-10-28T09:00:00Z', '3h ago'],
    ['2026-10-26T12:00:00Z', '2d ago'],
    ['2026-10-28T12:05:00Z', 'just now'], // slight clock skew
  ])('%s → %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });

  it('shows a date after a week', () => {
    expect(relativeTime('2026-10-01T12:00:00Z', now)).not.toMatch(/ago/);
  });
});
