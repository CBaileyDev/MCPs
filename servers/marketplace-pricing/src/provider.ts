/**
 * Provider interface for marketplace price comparison.
 *
 * Each marketplace requires its own authenticated API access and has its
 * own Terms of Service:
 *   - eBay: Browse API (OAuth application token) — see ebay.ts.
 *   - Amazon: Product Advertising API (requires an approved Associates
 *     account) — not implemented.
 *   - "Local parts stores": most have no public API; scraping typically
 *     violates ToS, so it is intentionally not implemented here.
 *
 * This file defines a clean interface plus a NotConfigured stub so real
 * adapters can be registered without changing the tool layer.
 */

export interface Listing {
  title: string;
  price: number;
  currency: string;
  condition?: string;
  seller?: string;
  url: string;
  marketplace: string;
}

export interface PriceComparison {
  query: string;
  listings: Listing[];
  lowest?: Listing;
  median?: number;
  sources: string[];
}

export interface MarketplaceProvider {
  readonly name: string;
  searchListings(query: string, limit?: number): Promise<Listing[]>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ProviderNotConfiguredError";
  }
}

export class NotConfiguredProvider implements MarketplaceProvider {
  readonly name = "not-configured";

  searchListings(): Promise<Listing[]> {
    throw new ProviderNotConfiguredError(
      "No marketplace provider is configured. To enable eBay, set EBAY_CLIENT_ID " +
        "and EBAY_CLIENT_SECRET and register the eBay provider via getProviders() " +
        "(adapter sketch in src/ebay.ts). Amazon and local-store providers are not " +
        "implemented (credential / ToS constraints)."
    );
  }
}

/** Compute lowest + median across listings from one or more providers. */
export function summarize(query: string, listings: Listing[]): PriceComparison {
  const sorted = [...listings].sort((a, b) => a.price - b.price);
  const prices = sorted.map(l => l.price);
  const median =
    prices.length === 0
      ? undefined
      : prices.length % 2
        ? prices[(prices.length - 1) / 2]
        : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
  return {
    query,
    listings: sorted,
    lowest: sorted[0],
    median,
    sources: [...new Set(sorted.map(l => l.marketplace))]
  };
}

/** Select active providers. Push real adapters here when credentials exist. */
export function getProviders(): MarketplaceProvider[] {
  return [new NotConfiguredProvider()];
}
