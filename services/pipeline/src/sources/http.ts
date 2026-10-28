export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Values used for conditional GET; stored per source between runs. */
export interface CacheValidators {
  etag?: string;
  lastModified?: string;
}

export type HttpResult =
  | { status: 'not-modified' }
  | {
      status: 'ok';
      body: string;
      finalUrl: string;
      contentType: string;
      validators: CacheValidators;
    };

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpClientOptions {
  userAgent: string;
  fetch?: FetchFn;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface GetOptions {
  validators?: CacheValidators;
  accept?: string;
}

export class HttpClient {
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxBytes = options.maxBytes ?? 2_000_000;
  }

  get userAgent(): string {
    return this.options.userAgent;
  }

  async get(url: string, { validators, accept }: GetOptions = {}): Promise<HttpResult> {
    const headers: Record<string, string> = {
      'User-Agent': this.options.userAgent,
      Accept: accept ?? '*/*',
    };
    if (validators?.etag) headers['If-None-Match'] = validators.etag;
    if (validators?.lastModified) headers['If-Modified-Since'] = validators.lastModified;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `timed out after ${this.timeoutMs} ms`
          : String(error instanceof Error ? error.message : error);
      throw new HttpError(`GET ${url} failed: ${reason}`, url);
    }

    if (response.status === 304) {
      await response.body?.cancel();
      return { status: 'not-modified' };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(`GET ${url} returned HTTP ${response.status}`, url, response.status);
    }

    const declared = Number(response.headers.get('content-length'));
    if (declared > this.maxBytes) {
      await response.body?.cancel();
      throw new HttpError(`GET ${url} body too large (${declared} bytes)`, url, response.status);
    }

    return {
      status: 'ok',
      body: await this.readCapped(response, url),
      finalUrl: response.url || url,
      contentType: response.headers.get('content-type') ?? '',
      validators: {
        ...(response.headers.get('etag') ? { etag: response.headers.get('etag')! } : {}),
        ...(response.headers.get('last-modified')
          ? { lastModified: response.headers.get('last-modified')! }
          : {}),
      },
    };
  }

  private async readCapped(response: Response, url: string): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxBytes) {
        await reader.cancel();
        throw new HttpError(
          `GET ${url} body exceeded ${this.maxBytes} bytes`,
          url,
          response.status,
        );
      }
      chunks.push(value);
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  }
}
