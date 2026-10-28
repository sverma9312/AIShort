export type StoreChoice = { kind: 'memory'; path?: string } | { kind: 'supabase' };

export interface StoreChoiceInput {
  mode: 'dry' | 'live';
  /** --store flag, if given. */
  flag?: string;
  /** --state flag, if given. */
  statePath?: string;
  defaultStatePath: string;
  hasDatabaseUrl: boolean;
  inCi: boolean;
}

/**
 * Decides where pipeline state lives.
 * - dry: in memory (fresh each run) unless --state is given
 * - live: Supabase when DATABASE_URL is set, otherwise a local JSON file
 * In CI a live run must use Supabase: there is no persistent disk, so an in-memory store would
 * publish a feed containing only the current run's cards and wipe everything else.
 */
export function chooseStore(input: StoreChoiceInput): StoreChoice {
  const { mode, flag, statePath, defaultStatePath, hasDatabaseUrl, inCi } = input;
  if (flag !== undefined && flag !== 'memory' && flag !== 'supabase') {
    throw new Error('--store must be "memory" or "supabase"');
  }
  const kind = flag ?? (mode === 'live' && hasDatabaseUrl ? 'supabase' : 'memory');

  if (kind === 'supabase') {
    if (!hasDatabaseUrl) throw new Error('--store supabase needs DATABASE_URL');
    return { kind };
  }
  if (mode === 'live' && inCi && flag !== 'memory') {
    throw new Error(
      'DATABASE_URL is required for live runs in CI (or pass --store memory explicitly)',
    );
  }
  const path = statePath ?? (mode === 'live' ? defaultStatePath : undefined);
  return path ? { kind: 'memory', path } : { kind: 'memory' };
}
