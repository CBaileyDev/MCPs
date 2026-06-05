import { describe, it, expect } from "vitest";
import { isAllowedExternalUrl, isTrustedFrameUrl } from "./url-allowlist.js";

describe("isAllowedExternalUrl", () => {
  it("allows the DTC look-up host and its subdomains over https", () => {
    expect(isAllowedExternalUrl("https://www.google.com/search?q=OBD-II%20P0301")).toBe(true);
    expect(isAllowedExternalUrl("https://google.com/")).toBe(true);
  });

  it("denies non-https schemes", () => {
    expect(isAllowedExternalUrl("http://www.google.com/")).toBe(false);
    expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
  });

  it("denies embedded credentials (https://evil.com@good.com)", () => {
    // Host here is google.com but userinfo is the attacker's — must be rejected.
    expect(isAllowedExternalUrl("https://evil.com@google.com/")).toBe(false);
  });

  it("denies hosts not on the allowlist, including look-alikes", () => {
    expect(isAllowedExternalUrl("https://evil.com/")).toBe(false);
    expect(isAllowedExternalUrl("https://google.com.evil.com/")).toBe(false);
    expect(isAllowedExternalUrl("https://notgoogle.com/")).toBe(false);
  });

  it("denies malformed input", () => {
    expect(isAllowedExternalUrl("not a url")).toBe(false);
    expect(isAllowedExternalUrl("")).toBe(false);
  });
});

describe("isTrustedFrameUrl", () => {
  it("trusts only file:// frames (the bundled app)", () => {
    expect(isTrustedFrameUrl("file:///Applications/Garage%20Copilot.app/index.html")).toBe(true);
    expect(isTrustedFrameUrl("https://evil.example/")).toBe(false);
    expect(isTrustedFrameUrl(undefined)).toBe(false);
    expect(isTrustedFrameUrl("")).toBe(false);
  });
});
