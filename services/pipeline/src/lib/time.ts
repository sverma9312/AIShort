/** Parses any date string `Date` understands (RFC 822, ISO 8601, …) into ISO 8601 UTC. */
export function toIsoUtc(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function hoursBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}
