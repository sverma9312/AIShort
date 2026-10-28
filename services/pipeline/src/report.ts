import type { RunReport } from './run';

/** Human-readable run summary (also suitable for $GITHUB_STEP_SUMMARY in Milestone 2). */
export function formatReport(report: RunReport, llmStats?: Record<string, unknown>): string {
  const okSources = report.sources.filter((s) => s.status !== 'error').length;
  const lines = [
    `AIShort pipeline run — ${report.startedAt}`,
    '',
    `Sources   ${okSources}/${report.sources.length} ok` +
      (report.sources.some((s) => s.status === 'error')
        ? ` (failed: ${report.sources
            .filter((s) => s.status === 'error')
            .map((s) => s.id)
            .join(', ')})`
        : ''),
    `Fetched   ${report.counts.fetched} items → ${report.counts.unseen} new → ${report.counts.extracted} with text → ${report.counts.stories} stories → ${report.counts.classified} classified → ${report.counts.cards} cards`,
    `Deferred  ${report.deferred}${report.llmUnavailable ? ' (LLM unavailable — will retry next run)' : ''}`,
    `Skipped   ${
      Object.entries(report.outcomes)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ') || '-'
    }`,
  ];
  if (llmStats && Object.keys(llmStats).length) lines.push(`LLM       ${JSON.stringify(llmStats)}`);
  if (report.newCards.length) {
    lines.push('', 'New cards:');
    for (const card of report.newCards) {
      lines.push(
        `  [${card.importance}] ${card.category.padEnd(11)} ${card.headline} — ${card.sourceName} (${card.provider})`,
      );
    }
  }
  return lines.join('\n');
}
