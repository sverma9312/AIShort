import { describe, expect, it } from 'vitest';
import { chooseStore, type StoreChoiceInput } from './choose';

const base: StoreChoiceInput = {
  mode: 'live',
  defaultStatePath: '/s.json',
  hasDatabaseUrl: false,
  inCi: false,
};

describe('chooseStore', () => {
  it('uses a fresh in-memory store for dry runs', () => {
    expect(chooseStore({ ...base, mode: 'dry', hasDatabaseUrl: true })).toEqual({ kind: 'memory' });
    expect(chooseStore({ ...base, mode: 'dry', statePath: '/x.json' })).toEqual({
      kind: 'memory',
      path: '/x.json',
    });
  });

  it('uses Supabase for live runs when DATABASE_URL is set, else the local state file', () => {
    expect(chooseStore({ ...base, hasDatabaseUrl: true })).toEqual({ kind: 'supabase' });
    expect(chooseStore(base)).toEqual({ kind: 'memory', path: '/s.json' });
  });

  it('honors an explicit --store', () => {
    expect(chooseStore({ ...base, hasDatabaseUrl: true, flag: 'memory' })).toEqual({
      kind: 'memory',
      path: '/s.json',
    });
    expect(() => chooseStore({ ...base, flag: 'supabase' })).toThrow(/needs DATABASE_URL/);
    expect(() => chooseStore({ ...base, flag: 'redis' })).toThrow(/--store must be/);
  });

  it('refuses an implicit in-memory store for live runs in CI', () => {
    expect(() => chooseStore({ ...base, inCi: true })).toThrow(/DATABASE_URL is required/);
    expect(chooseStore({ ...base, inCi: true, hasDatabaseUrl: true })).toEqual({
      kind: 'supabase',
    });
    expect(chooseStore({ ...base, inCi: true, flag: 'memory' }).kind).toBe('memory');
    expect(chooseStore({ ...base, inCi: true, mode: 'dry' }).kind).toBe('memory');
  });
});
