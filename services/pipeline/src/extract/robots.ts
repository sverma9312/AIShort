import robotsParser from 'robots-parser';
import { HttpError, type HttpClient } from '../sources/http';

type RobotsRules = { isAllowed(url: string, ua?: string): boolean | undefined };

/**
 * robots.txt checks, cached per origin for the lifetime of the instance (one pipeline run).
 * Follows RFC 9309: a missing robots.txt (4xx) allows everything; an unreachable one
 * (5xx / network error) is treated as "disallow all" for this run.
 */
export class RobotsChecker {
  private readonly cache = new Map<string, Promise<RobotsRules | 'allow-all' | 'disallow-all'>>();

  /** `agentToken` is the product token matched against User-agent lines, e.g. "AIShortBot". */
  constructor(
    private readonly http: HttpClient,
    private readonly agentToken: string,
  ) {}

  async isAllowed(url: string): Promise<boolean> {
    const origin = new URL(url).origin;
    let rules = this.cache.get(origin);
    if (!rules) {
      rules = this.load(origin);
      this.cache.set(origin, rules);
    }
    const resolved = await rules;
    if (resolved === 'allow-all') return true;
    if (resolved === 'disallow-all') return false;
    return resolved.isAllowed(url, this.agentToken) ?? true;
  }

  private async load(origin: string): Promise<RobotsRules | 'allow-all' | 'disallow-all'> {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const response = await this.http.get(robotsUrl, { accept: 'text/plain' });
      if (response.status !== 'ok') return 'allow-all';
      return robotsParser(robotsUrl, response.body);
    } catch (error) {
      if (error instanceof HttpError && error.status !== undefined && error.status < 500) {
        return 'allow-all';
      }
      return 'disallow-all';
    }
  }
}
