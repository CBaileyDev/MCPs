import { afterEach, describe, expect, it, vi } from "vitest";
import { validateMakeModelYear } from "./client.js";

function mockFetch(json: unknown): void {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => json
  })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("validateMakeModelYear", () => {
  it("matches case-insensitively and returns canonical spelling", async () => {
    mockFetch({ Count: 1, Message: "", Results: [{ Make_Name: "HONDA", Model_Name: "Civic" }] });
    const result = await validateMakeModelYear("honda", "civic", 2020);
    expect(result.valid).toBe(true);
    expect(result.canonicalModel).toBe("Civic");
    expect(result.canonicalMake).toBe("HONDA");
  });

  it("is invalid when the model is not in the list", async () => {
    mockFetch({ Count: 1, Message: "", Results: [{ Make_Name: "HONDA", Model_Name: "Civic" }] });
    const result = await validateMakeModelYear("honda", "civicc", 2020);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/Civic/);
  });

  it("is invalid when no models exist for the make/year", async () => {
    mockFetch({ Count: 0, Message: "", Results: [] });
    const result = await validateMakeModelYear("nope", "abc", 2020);
    expect(result.valid).toBe(false);
  });
});
