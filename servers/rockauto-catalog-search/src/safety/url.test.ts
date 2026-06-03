import { describe, expect, it } from "vitest";
import { normalizeRockAutoUrl } from "./url.js";

describe("normalizeRockAutoUrl", () => {
  it("normalizes relative RockAuto catalog paths", () => {
    expect(normalizeRockAutoUrl("/en/catalog/toyota,2020,camry")).toBe(
      "https://www.rockauto.com/en/catalog/toyota,2020,camry"
    );
  });

  it("allows public RockAuto catalog and details URLs", () => {
    expect(normalizeRockAutoUrl("https://www.rockauto.com/en/moreinfo.php?pk=123")).toBe(
      "https://www.rockauto.com/en/moreinfo.php?pk=123"
    );
  });

  it("rejects non-RockAuto URLs", () => {
    expect(() => normalizeRockAutoUrl("https://example.com/en/catalog/toyota")).toThrow("Only rockauto.com URLs are supported");
  });

  it("rejects account, cart, and checkout paths", () => {
    expect(() => normalizeRockAutoUrl("https://www.rockauto.com/en/cart")).toThrow("Unsupported RockAuto path");
    expect(() => normalizeRockAutoUrl("https://www.rockauto.com/en/accountactivity")).toThrow("Unsupported RockAuto path");
    expect(() => normalizeRockAutoUrl("https://www.rockauto.com/en/checkout")).toThrow("Unsupported RockAuto path");
  });
});
