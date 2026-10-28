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

/** Markdown summary for the GitHub Actions run page ($GITHUB_STEP_SUMMARY). */
export function formatMarkdownReport(
  report: RunReport,
  llmStats?: Record<string, unknown>,
): string {
  const failed = report.sources.filter((s) => s.status === 'error');
  const lines = [
    `## AIShort pipeline — ${report.counts.cards} new card${report.counts.cards === 1 ? '' : 's'}`,
    '',
    '| Stage | Count |',
    '|---|---|',
    `| Sources ok | ${report.sources.length - failed.length} / ${report.sources.length} |`,
    `| Items fetched | ${report.counts.fetched} |`,
    `| New items | ${report.counts.unseen} |`,
    `| With article text | ${report.counts.extracted} |`,
    `| New stories | ${report.counts.stories} |`,
    `| Cards published | ${report.counts.cards} |`,
    `| Deferred to next run | ${report.deferred}${report.llmUnavailable ? ' ⚠️ LLM unavailable' : ''} |`,
  ];
  if (failed.length) {
    lines.push(
      '',
      '### Failed sources',
      '',
      '| Source | Failures in a row | Error |',
      '|---|---|---|',
    );
    for (const s of failed)
      lines.push(`| ${s.id} | ${s.consecutiveFailures} | ${escapeCell(s.error ?? '')} |`);
  }
  const skipped = Object.entries(report.outcomes)
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);
  if (skipped.length) {
    lines.push(
      '',
      '<details><summary>Skipped items by reason</summary>',
      '',
      '| Reason | Count |',
      '|---|---|',
    );
    for (const [reason, n] of skipped) lines.push(`| ${reason} | ${n} |`);
    lines.push('', '</details>');
  }
  if (llmStats && Object.keys(llmStats).length)
    lines.push('', `LLM: \`${JSON.stringify(llmStats)}\``);
  if (report.newCards.length) {
    lines.push(
      '',
      '### New cards',
      '',
      '| Importance | Category | Headline | Source |',
      '|---|---|---|---|',
    );
    for (const c of report.newCards)
      lines.push(
        `| ${c.importance} | ${c.category} | ${escapeCell(c.headline)} | ${escapeCell(c.sourceName)} |`,
      );
  }
  return `${lines.join('\n')}\n`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200);
}
