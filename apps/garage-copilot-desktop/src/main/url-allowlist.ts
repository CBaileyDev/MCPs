/**
 * Pure (no Electron) URL-trust helpers used by the main process to harden two
 * classic foot-guns: `shell.openExternal` and IPC sender spoofing. Kept free of
 * Electron imports so the security logic can be unit-tested in plain Node.
 */

/** Hosts the app is allowed to hand to the OS browser. Keep this minimal. */
export const EXTERNAL_HOST_ALLOWLIST = ["google.com"] as const;

/**
 * Whether `raw` may be opened in the OS browser via `shell.openExternal`.
 *
 * Only well-formed `https:` URLs whose host is on {@link EXTERNAL_HOST_ALLOWLIST}
 * (or a subdomain of one) pass. Everything else is denied — `http:`,
 * `file:`/`javascript:` schemes, embedded credentials (the classic
 * `https://evil.com@good.com` trick), and look-alike hosts.
 */
export function isAllowedExternalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false; // not a parseable absolute URL
  }
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false; // userinfo spoofing
  const host = url.hostname.toLowerCase();
  return EXTERNAL_HOST_ALLOWLIST.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Whether an IPC message's sender frame belongs to our bundled app. The app is
 * loaded from disk (`file://`), so any other origin is treated as untrusted.
 */
export function isTrustedFrameUrl(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith("file://");
}
