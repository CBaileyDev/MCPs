import type { NormalizedPart } from "../domain/types.js";

export type VehicleQuery = {
  year: number;
  make: string;
  model: string;
};

export type VehicleCandidate = VehicleQuery & {
  engine?: string;
  carCode?: string;
  sourceUrl: string;
};

export type VehicleSearchResult = {
  query: VehicleQuery;
  vehicles: VehicleCandidate[];
  fetchedAt: string;
};

export type VehicleOptionsResult = {
  options: Array<{
    engine: string;
    carCode: string;
    sourceUrl: string;
  }>;
  fetchedAt: string;
};

export type PartCategoryResult = {
  categories: Array<{
    name: string;
    sourceUrl: string;
  }>;
  fetchedAt: string;
};

export type SearchPartsInput = VehicleQuery & {
  engine?: string;
  carCode?: string;
  category?: string;
  partType?: string;
  sourceUrl?: string;
};

export type SearchPartsResult = {
  query: SearchPartsInput;
  parts: NormalizedPart[];
  sourceUrl: string;
  fetchedAt: string;
};

export type SearchPartNumberInput = {
  partNumber: string;
};

export type SearchPartNumberResult = {
  query: string;
  parts: NormalizedPart[];
  sourceUrl: string;
  fetchedAt: string;
};

export type PartDetailsInput = {
  sourceUrl: string;
};

export type PartDetailsResult = {
  part: NormalizedPart;
  fetchedAt: string;
};

export interface RockAutoCatalogProvider {
  searchVehicle(input: VehicleQuery): Promise<VehicleSearchResult>;
  listVehicleOptions(input: VehicleQuery): Promise<VehicleOptionsResult>;
  listPartCategories(input: VehicleQuery & { engine?: string; carCode?: string }): Promise<PartCategoryResult>;
  searchParts(input: SearchPartsInput): Promise<SearchPartsResult>;
  searchPartNumber(input: SearchPartNumberInput): Promise<SearchPartNumberResult>;
  getPartDetails(input: PartDetailsInput): Promise<PartDetailsResult>;
}
