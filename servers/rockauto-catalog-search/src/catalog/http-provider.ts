import { TtlCache } from "../safety/cache.js";
import { SequentialRateLimiter } from "../safety/rate-limit.js";
import { normalizeRockAutoUrl } from "../safety/url.js";
import {
  buildCatalogUrl,
  buildPartSearchUrl,
  createPageLevelPart,
  extractCategoryNames,
  extractPageTitle,
  extractVehicleCandidates
} from "./html.js";
import type {
  PartCategoryResult,
  PartDetailsInput,
  PartDetailsResult,
  RockAutoCatalogProvider,
  SearchPartNumberInput,
  SearchPartNumberResult,
  SearchPartsInput,
  SearchPartsResult,
  VehicleOptionsResult,
  VehicleQuery,
  VehicleSearchResult
} from "./provider.js";

export class RockAutoHttpProvider implements RockAutoCatalogProvider {
  private readonly cache = new TtlCache<string>({ ttlMs: 5 * 60 * 1_000 });
  private readonly limiter = new SequentialRateLimiter({ minimumDelayMs: 1_000 });

  async searchVehicle(input: VehicleQuery): Promise<VehicleSearchResult> {
    const sourceUrl = buildCatalogUrl(input);
    const html = await this.fetchText(sourceUrl);

    return {
      query: input,
      vehicles: extractVehicleCandidates(html, input),
      fetchedAt: new Date().toISOString()
    };
  }

  async listVehicleOptions(input: VehicleQuery): Promise<VehicleOptionsResult> {
    const vehicleResult = await this.searchVehicle(input);

    return {
      options: vehicleResult.vehicles
        .filter(vehicle => vehicle.engine && vehicle.carCode)
        .map(vehicle => ({
          engine: vehicle.engine as string,
          carCode: vehicle.carCode as string,
          sourceUrl: vehicle.sourceUrl
        })),
      fetchedAt: vehicleResult.fetchedAt
    };
  }

  async listPartCategories(input: VehicleQuery & { engine?: string; carCode?: string }): Promise<PartCategoryResult> {
    const sourceUrl = buildCatalogUrl(input);
    const html = await this.fetchText(sourceUrl);

    return {
      categories: extractCategoryNames(html, input),
      fetchedAt: new Date().toISOString()
    };
  }

  async searchParts(input: SearchPartsInput): Promise<SearchPartsResult> {
    const sourceUrl = input.sourceUrl ? normalizeRockAutoUrl(input.sourceUrl) : buildCatalogUrl(input);
    const html = await this.fetchText(sourceUrl);
    const fetchedAt = new Date().toISOString();

    return {
      query: input,
      parts: [
        createPageLevelPart({
          id: `parts:${sourceUrl}`,
          partNumber: input.partType ?? input.category ?? "catalog-search",
          title: extractPageTitle(html),
          sourceUrl,
          fetchedAt
        })
      ],
      sourceUrl,
      fetchedAt
    };
  }

  async searchPartNumber(input: SearchPartNumberInput): Promise<SearchPartNumberResult> {
    const sourceUrl = buildPartSearchUrl(input.partNumber);
    const html = await this.fetchText(sourceUrl);
    const fetchedAt = new Date().toISOString();

    return {
      query: input.partNumber,
      parts: [
        createPageLevelPart({
          id: `part-number:${input.partNumber}`,
          partNumber: input.partNumber,
          title: extractPageTitle(html),
          sourceUrl,
          fetchedAt
        })
      ],
      sourceUrl,
      fetchedAt
    };
  }

  async getPartDetails(input: PartDetailsInput): Promise<PartDetailsResult> {
    const sourceUrl = normalizeRockAutoUrl(input.sourceUrl);
    const html = await this.fetchText(sourceUrl);
    const fetchedAt = new Date().toISOString();

    return {
      part: createPageLevelPart({
        id: `details:${sourceUrl}`,
        partNumber: "detail-page",
        title: extractPageTitle(html),
        sourceUrl,
        fetchedAt
      }),
      fetchedAt
    };
  }

  private async fetchText(rawUrl: string): Promise<string> {
    const url = normalizeRockAutoUrl(rawUrl);
    const cached = this.cache.get(url);

    if (cached) {
      return cached;
    }

    const html = await this.limiter.run(async () => {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "rockauto-catalog-search-mcp/0.1.0 user-requested-catalog-lookup",
          "Accept": "text/html,application/xhtml+xml"
        }
      });

      if (!response.ok) {
        throw new Error(`RockAuto request failed: ${response.status} ${response.statusText}`);
      }

      return response.text();
    });

    this.cache.set(url, html);
    return html;
  }
}
