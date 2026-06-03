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

/** Fetch JSON with a timeout, throwing HttpError on failure. */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(rest.headers ?? {}) }
    });
    if (!res.ok) {
      throw new HttpError(`Request failed (${res.status} ${res.statusText})`, res.status, url);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new HttpError(`Request timed out after ${timeoutMs}ms`, 0, url);
    }
    throw new HttpError(err instanceof Error ? err.message : String(err), 0, url);
  } finally {
    clearTimeout(timer);
  }
}

/** Encode a URL path segment (make/model names may contain spaces). */
export function seg(value: string | number): string {
  return encodeURIComponent(String(value).trim());
}
