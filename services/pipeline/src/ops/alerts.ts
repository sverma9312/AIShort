import type { RunReport } from '../run';
import type { FetchFn } from '../sources/http';

/** Alert when a source has failed this many runs in a row (once, not every run after). */
export const SOURCE_FAILURE_ALERT_AT = 3;

/** Problems worth a human's attention in this run; empty when everything is fine. */
export function alertsFor(report: RunReport): string[] {
  const alerts: string[] = [];
  if (report.sources.length > 0 && report.sources.every((s) => s.status === 'error')) {
    alerts.push('Every source failed — check network access or the runner.');
  }
  for (const source of report.sources) {
    if (source.status === 'error' && source.consecutiveFailures === SOURCE_FAILURE_ALERT_AT) {
      alerts.push(
        `Source \`${source.id}\` has failed ${SOURCE_FAILURE_ALERT_AT} runs in a row: ${source.error ?? 'unknown error'}`,
      );
    }
  }
  if (report.llmUnavailable) {
    alerts.push(
      `No LLM provider was available; ${report.deferred} items deferred to the next run. Check quotas and API keys.`,
    );
  }
  return alerts;
}

/** Posts alerts to a Discord webhook. Never throws: alerting must not fail the run. */
export async function sendDiscordAlert(
  webhookUrl: string,
  alerts: string[],
  runUrl?: string,
  fetchFn: FetchFn = (i, init) => fetch(i, init),
): Promise<boolean> {
  if (alerts.length === 0) return true;
  const content = [
    `**AIShort pipeline**${runUrl ? ` — <${runUrl}>` : ''}`,
    ...alerts.map((a) => `• ${a}`),
  ]
    .join('\n')
    .slice(0, 1900);
  try {
    const response = await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Markdown version of the run report for $GITHUB_STEP_SUMMARY. */
export function stepSummary(plainReport: string, alerts: string[]): string {
  return [
    '## AIShort pipeline run',
    '',
    ...(alerts.length ? ['### ⚠️ Alerts', '', ...alerts.map((a) => `- ${a}`), ''] : []),
    '```',
    plainReport,
    '```',
    '',
  ].join('\n');
}
