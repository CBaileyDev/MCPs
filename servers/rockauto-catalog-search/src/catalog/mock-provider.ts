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

export class MockRockAutoProvider implements RockAutoCatalogProvider {
  async searchVehicle(input: VehicleQuery): Promise<VehicleSearchResult> {
    return {
      query: input,
      vehicles: [{ ...input, engine: "2.5L L4", carCode: "3445372", sourceUrl: "https://www.rockauto.com/en/catalog/toyota,2020,camry,2.5l+l4,3445372" }],
      fetchedAt: new Date().toISOString()
    };
  }

  async listVehicleOptions(): Promise<VehicleOptionsResult> {
    return {
      options: [{ engine: "2.5L L4", carCode: "3445372", sourceUrl: "https://www.rockauto.com/en/catalog/toyota,2020,camry,2.5l+l4,3445372" }],
      fetchedAt: new Date().toISOString()
    };
  }

  async listPartCategories(): Promise<PartCategoryResult> {
    return {
      categories: [{ name: "Brake & Wheel Hub", sourceUrl: "https://www.rockauto.com/en/catalog/toyota,2020,camry,2.5l+l4,3445372,brake+&+wheel+hub" }],
      fetchedAt: new Date().toISOString()
    };
  }

  async searchParts(input: SearchPartsInput): Promise<SearchPartsResult> {
    const fetchedAt = new Date().toISOString();
    return {
      query: input,
      parts: [],
      sourceUrl: input.sourceUrl ?? "https://www.rockauto.com/en/catalog/toyota,2020,camry",
      fetchedAt
    };
  }

  async searchPartNumber(input: SearchPartNumberInput): Promise<SearchPartNumberResult> {
    const fetchedAt = new Date().toISOString();
    return {
      query: input.partNumber,
      parts: [],
      sourceUrl: `https://www.rockauto.com/en/partsearch/?partnum=${encodeURIComponent(input.partNumber)}`,
      fetchedAt
    };
  }

  async getPartDetails(input: PartDetailsInput): Promise<PartDetailsResult> {
    const fetchedAt = new Date().toISOString();
    return {
      part: {
        id: input.sourceUrl,
        brand: "RockAuto",
        partNumber: "detail-page",
        title: "RockAuto detail page",
        price: null,
        availability: null,
        fitmentNotes: [],
        sourceUrl: input.sourceUrl,
        fetchedAt
      },
      fetchedAt
    };
  }
}
