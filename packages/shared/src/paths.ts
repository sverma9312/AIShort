import { z } from 'zod';

const archiveDateSchema = z.iso.date();

/** Paths of the published feed files, relative to a feed base URL. */
export const FEED_PATHS = {
  latest: 'v1/feed/latest.json',
  meta: 'v1/meta.json',
  /** Daily archive page; `date` is a UTC calendar date in `YYYY-MM-DD` format. */
  archive(date: string): string {
    if (!archiveDateSchema.safeParse(date).success) {
      throw new RangeError(`Invalid archive date "${date}", expected YYYY-MM-DD`);
    }
    return `v1/feed/archive/${date}.json`;
  },
} as const;

/** Joins a feed base URL (with or without a trailing slash) and a feed path. */
export function feedUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path}`;
}
