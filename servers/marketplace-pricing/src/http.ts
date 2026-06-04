export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Descriptive default User-Agent (good API citizenship; overridable per call). */
const DEFAULT_USER_AGENT = "cbaileydev-auto-mcps (+https://github.com/CBaileyDev/MCPs)";

/**
 * Transient statuses worth retrying. Deliberately excludes ordinary 4xx
 * (400/401/403/404/...) — those are not retried, ever. 429 (rate limit) and the
 * 5xx gateway/unavailable codes are transient.
 */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export interface FetchJsonInit extends RequestInit {
  /** Per-attempt timeout in ms (default 15000). */
  timeoutMs?: number;
  /** Max retries for transient failures on idempotent (GET) requests (default 2). */
  retries?: number;
  /** Base backoff between retries in ms (default 300; doubles each attempt). */
  retryDelayMs?: number;
}

/**
 * Fetch JSON with a per-attempt timeout, throwing HttpError on failure.
 *
 * Retries only happen for GET requests and only on transient failures (network
 * errors or 429/502/503/504), with bounded exponential backoff. Non-GET methods
 * and non-transient statuses (e.g. 404) are never retried.
 */
export async function fetchJson<T = unknown>(url: string, init: FetchJsonInit = {}): Promise<T> {
  const { timeoutMs = 15_000, retries = 2, retryDelayMs = 300, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" ? retries + 1 : 1;

  let lastError: HttpError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...rest,
        signal: controller.signal,
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          Accept: "application/json",
          ...(rest.headers ?? {})
        }
      });
      if (!res.ok) {
        const err = new HttpError(`Request failed (${res.status} ${res.statusText})`, res.status, url);
        if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
          lastError = err;
          await sleep(retryDelayMs * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // Our own deadline fired — surface it, don't retry.
      if (err instanceof Error && err.name === "AbortError") {
        throw new HttpError(`Request timed out after ${timeoutMs}ms`, 0, url);
      }
      // Network-level failure (fetch rejected): retry if attempts remain.
      const netError = new HttpError(err instanceof Error ? err.message : String(err), 0, url);
      if (attempt < maxAttempts) {
        lastError = netError;
        await sleep(retryDelayMs * 2 ** (attempt - 1));
        continue;
      }
      throw netError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new HttpError("Request failed", 0, url);
}

/** Encode a URL path/query segment (make/model names may contain spaces). */
export function seg(value: string | number): string {
  return encodeURIComponent(String(value).trim());
}
