import type { Logger } from './lib/log';
import type { RunReport } from './run';
import type { FetchFn } from './sources/http';
import type { Store } from './store/types';

/** Alert after this many consecutive failed runs of one source. */
export const SOURCE_FAILURE_THRESHOLD = 3;

export interface Alert {
  /** Stable identity used for cooldown and recovery tracking. */
  key: string;
  message: string;
}

/** Problems in this run that someone should know about. */
export function collectAlerts(report: RunReport): Alert[] {
  const alerts: Alert[] = [];
  const failed = report.sources.filter((s) => s.status === 'error');
  if (report.sources.length > 0 && failed.length === report.sources.length) {
    alerts.push({
      key: 'all-sources-failed',
      message: 'Every source failed this run — check network access or the runner.',
    });
  }
  for (const source of failed) {
    if (source.consecutiveFailures >= SOURCE_FAILURE_THRESHOLD) {
      alerts.push({
        key: `source-failing:${source.id}`,
        message: `Source \`${source.id}\` has failed ${source.consecutiveFailures} runs in a row: ${source.error ?? 'unknown error'}`,
      });
    }
  }
  if (report.llmUnavailable) {
    alerts.push({
      key: 'llm-unavailable',
      message: `No LLM provider was available; ${report.deferred} items were deferred to the next run. Check quotas and API keys.`,
    });
  }
  return alerts;
}

export interface AlertDeps {
  store: Store;
  now: Date;
  log: Logger;
  webhookUrl?: string;
  fetch?: FetchFn;
  /** Don't repeat the same alert within this many hours. */
  cooldownHours?: number;
}

interface AlertState {
  lastSentAt: string;
}

/**
 * Sends new alerts to a Discord webhook, at most once per cooldown per alert key, and a
 * "recovered" message when a previously alerted problem is gone. Without a webhook URL alerts
 * are only logged. Never throws: alerting must not fail the run.
 */
export async function dispatchAlerts(
  alerts: Alert[],
  deps: AlertDeps,
): Promise<{ sent: string[]; recovered: string[] }> {
  const { store, now, log, webhookUrl, cooldownHours = 6 } = deps;
  const fetchFn = deps.fetch ?? ((input, init) => fetch(input, init));
  const active = (await store.getMeta<string[]>('alerts:active')) ?? [];
  const current = new Set(alerts.map((a) => a.key));
  const sent: string[] = [];
  const recovered = active.filter((key) => !current.has(key));

  const post = async (content: string) => {
    if (!webhookUrl) return true;
    try {
      const response = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.slice(0, 1900) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) log.warn('alert webhook failed', { status: response.status });
      return response.ok;
    } catch (error) {
      log.warn('alert webhook failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  for (const alert of alerts) {
    log.warn('alert', { key: alert.key, message: alert.message });
    const state = await store.getMeta<AlertState>(`alert:${alert.key}`);
    if (state && now.getTime() - new Date(state.lastSentAt).getTime() < cooldownHours * 3_600_000)
      continue;
    if (await post(`⚠️ **AIShort pipeline** — ${alert.message}`)) {
      await store.setMeta(`alert:${alert.key}`, {
        lastSentAt: now.toISOString(),
      } satisfies AlertState);
      sent.push(alert.key);
    }
  }
  for (const key of recovered) {
    log.info('alert resolved', { key });
    await post(`✅ **AIShort pipeline** — resolved: \`${key}\``);
    await store.setMeta(`alert:${key}`, null);
  }
  await store.setMeta('alerts:active', [...current]);
  return { sent, recovered };
}
