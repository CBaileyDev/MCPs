const BASE_URL = "https://www.rockauto.com";
const SUPPORTED_PATH_PREFIXES = ["/en/catalog", "/en/partsearch", "/en/moreinfo.php", "/en/tools"];
const UNSUPPORTED_PATH_PARTS = ["cart", "account", "accountactivity", "checkout", "orderstatus", "login"];

export function normalizeRockAutoUrl(input: string): string {
  const url = input.startsWith("/")
    ? new URL(input, BASE_URL)
    : new URL(input);

  if (url.hostname !== "www.rockauto.com" && url.hostname !== "rockauto.com") {
    throw new Error("Only rockauto.com URLs are supported");
  }

  const path = url.pathname.toLowerCase();

  if (UNSUPPORTED_PATH_PARTS.some(part => path.includes(part))) {
    throw new Error("Unsupported RockAuto path for this catalog/search-only MCP");
  }

  if (!SUPPORTED_PATH_PREFIXES.some(prefix => path.startsWith(prefix))) {
    throw new Error("Unsupported RockAuto path for this catalog/search-only MCP");
  }

  url.protocol = "https:";
  url.hostname = "www.rockauto.com";
  return url.toString();
}
