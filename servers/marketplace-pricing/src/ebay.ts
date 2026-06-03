/**
 * eBay Browse API adapter — SKETCH, not registered by default.
 *
 * To use:
 *   1. Create an eBay developer app: https://developer.ebay.com/
 *   2. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in the environment.
 *   3. Register `new EbayProvider()` from getProviders() in src/provider.ts.
 *
 * This is intentionally minimal and untested against the live API. It
 * demonstrates the OAuth client-credentials flow and item_summary search.
 */
import { fetchJson, seg } from "./http.js";
import type { Listing, MarketplaceProvider } from "./provider.js";

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface BrowseResponse {
  itemSummaries?: Array<{
    title: string;
    price?: { value: string; currency: string };
    condition?: string;
    seller?: { username?: string };
    itemWebUrl: string;
  }>;
}

export class EbayProvider implements MarketplaceProvider {
  readonly name = "ebay";
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly clientId = process.env.EBAY_CLIENT_ID,
    private readonly clientSecret = process.env.EBAY_CLIENT_SECRET
  ) {}

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    if (!this.clientId || !this.clientSecret) {
      throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set");
    }
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetchJson<TokenResponse>(OAUTH_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope"
    });
    this.token = { value: res.access_token, expiresAt: Date.now() + (res.expires_in - 60) * 1000 };
    return res.access_token;
  }

  async searchListings(query: string, limit = 20): Promise<Listing[]> {
    const token = await this.getToken();
    // category 6028 = eBay Motors: Parts & Accessories
    const url = `${BROWSE_URL}?q=${seg(query)}&limit=${limit}&category_ids=6028`;
    const data = await fetchJson<BrowseResponse>(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return (data.itemSummaries ?? [])
      .filter(i => i.price)
      .map(i => ({
        title: i.title,
        price: Number(i.price!.value),
        currency: i.price!.currency,
        condition: i.condition,
        seller: i.seller?.username,
        url: i.itemWebUrl,
        marketplace: "ebay"
      }));
  }
}
