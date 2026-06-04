import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, HttpError } from "./http.js";

afterEach(() => vi.restoreAllMocks());

const okJson = (data: unknown) => ({ ok: true, status: 200, statusText: "OK", json: async () => data });
const failStatus = (status: number) => ({ ok: false, status, statusText: "err", json: async () => ({}) });

describe("fetchJson retry policy", () => {
  it("does NOT retry a 404 (or any ordinary 4xx)", async () => {
    global.fetch = vi.fn(async () => failStatus(404)) as unknown as typeof fetch;
    await expect(fetchJson("https://x", { retries: 2, retryDelayMs: 0 })).rejects.toBeInstanceOf(HttpError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 503 and then succeeds", async () => {
    let n = 0;
    global.fetch = vi.fn(async () => (++n < 3 ? failStatus(503) : okJson({ ok: 1 }))) as unknown as typeof fetch;
    const result = await fetchJson<{ ok: number }>("https://x", { retries: 2, retryDelayMs: 0 });
    expect(result).toEqual({ ok: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("retries a network error and then succeeds", async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      if (++n < 2) throw new TypeError("network down");
      return okJson({ a: 2 });
    }) as unknown as typeof fetch;
    const result = await fetchJson<{ a: number }>("https://x", { retries: 2, retryDelayMs: 0 });
    expect(result).toEqual({ a: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-GET (POST) even on a transient 503", async () => {
    global.fetch = vi.fn(async () => failStatus(503)) as unknown as typeof fetch;
    await expect(
      fetchJson("https://x", { method: "POST", retries: 2, retryDelayMs: 0 })
    ).rejects.toBeInstanceOf(HttpError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on a persistent 503", async () => {
    global.fetch = vi.fn(async () => failStatus(503)) as unknown as typeof fetch;
    await expect(fetchJson("https://x", { retries: 2, retryDelayMs: 0 })).rejects.toMatchObject({ status: 503 });
    expect(global.fetch).toHaveBeenCalledTimes(3); // 1 try + 2 retries
  });

  it("sends a default User-Agent that callers can override", async () => {
    let captured: Record<string, string> = {};
    global.fetch = vi.fn(async (_url: string, opts: { headers: Record<string, string> }) => {
      captured = opts.headers;
      return okJson({});
    }) as unknown as typeof fetch;

    await fetchJson("https://x");
    expect(captured["User-Agent"]).toContain("auto-mcps");

    await fetchJson("https://x", { headers: { "User-Agent": "custom-agent/1.0" } });
    expect(captured["User-Agent"]).toBe("custom-agent/1.0");
  });
});
