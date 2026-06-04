import { fetchJson, seg } from "./http.js";

const BASE = "https://api.nhtsa.gov";
const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

interface NhtsaResponse<T> {
  count?: number;
  results?: T[];
  Count?: number;
  Results?: T[];
}

interface VpicDecodeResponse {
  Count: number;
  Message: string;
  Results: Array<Record<string, string>>;
}

export interface DecodedVehicle {
  make: string;
  model: string;
  modelYear: number;
}

export interface RecallsByVinResult {
  vin: string;
  decoded: DecodedVehicle;
  recalls: Array<Record<string, unknown>>;
}

export interface RecallsByVinIncomplete {
  vin: string;
  decoded: Partial<DecodedVehicle> & { raw: Record<string, string> };
  message: string;
}

function rows<T>(data: NhtsaResponse<T>): T[] {
  return data.results ?? data.Results ?? [];
}

export async function getRecalls(make: string, model: string, year: number) {
  const url = `${BASE}/recalls/recallsByVehicle?make=${seg(make)}&model=${seg(model)}&modelYear=${year}`;
  return rows(await fetchJson<NhtsaResponse<Record<string, unknown>>>(url));
}

export async function getComplaints(make: string, model: string, year: number) {
  const url = `${BASE}/complaints/complaintsByVehicle?make=${seg(make)}&model=${seg(model)}&modelYear=${year}`;
  return rows(await fetchJson<NhtsaResponse<Record<string, unknown>>>(url));
}

/**
 * Safety ratings. NHTSA's SafetyRatings endpoint is hierarchical: a
 * year/make/model lookup returns variants, each with a VehicleId used to
 * fetch the actual star ratings. We resolve up to five variants for convenience.
 */
export async function getSafetyRatings(make: string, model: string, year: number) {
  const listUrl = `${BASE}/SafetyRatings/modelyear/${year}/make/${seg(make)}/model/${seg(model)}`;
  const variants = rows(
    await fetchJson<NhtsaResponse<{ VehicleId: number; VehicleDescription: string }>>(listUrl)
  );
  if (variants.length === 0) return { variants: [], ratings: [] };
  const ratings = await Promise.all(
    variants.slice(0, 5).map(async variant => {
      const detail = rows(
        await fetchJson<NhtsaResponse<Record<string, unknown>>>(
          `${BASE}/SafetyRatings/VehicleId/${variant.VehicleId}`
        )
      );
      return { vehicle: variant, rating: detail[0] ?? null };
    })
  );
  return { variants, ratings };
}

/**
 * Decode a VIN via the NHTSA vPIC DecodeVinValues endpoint.
 * Returns the extracted make, model, and modelYear (coerced to number).
 */
export async function decodeVin(vin: string): Promise<DecodedVehicle | null> {
  const url = `${VPIC_BASE}/DecodeVinValues/${seg(vin)}?format=json`;
  const data = await fetchJson<VpicDecodeResponse>(url);
  const raw = data.Results[0] ?? {};
  const make = (raw["Make"] ?? "").trim();
  const model = (raw["Model"] ?? "").trim();
  const yearStr = (raw["ModelYear"] ?? "").trim();
  const modelYear = yearStr ? Number(yearStr) : NaN;

  if (!make || !model || !Number.isFinite(modelYear) || modelYear === 0) {
    return null;
  }
  return { make, model, modelYear };
}

/**
 * Decode a VIN and look up NHTSA recalls for the decoded vehicle.
 * Returns vehicle identity + recalls, or a message if the VIN cannot be decoded.
 */
export async function getRecallsByVin(
  vin: string
): Promise<RecallsByVinResult | RecallsByVinIncomplete> {
  const url = `${VPIC_BASE}/DecodeVinValues/${seg(vin)}?format=json`;
  const data = await fetchJson<VpicDecodeResponse>(url);
  const raw = data.Results[0] ?? {};

  const make = (raw["Make"] ?? "").trim();
  const model = (raw["Model"] ?? "").trim();
  const yearStr = (raw["ModelYear"] ?? "").trim();
  const modelYear = yearStr ? Number(yearStr) : NaN;

  if (!make || !model || !Number.isFinite(modelYear) || modelYear === 0) {
    return {
      vin,
      decoded: { raw, ...(make ? { make } : {}), ...(model ? { model } : {}), ...(Number.isFinite(modelYear) && modelYear !== 0 ? { modelYear } : {}) },
      message:
        "Could not fully decode the VIN: make, model, or model year is missing. Verify the VIN and try again."
    };
  }

  const recalls = await getRecalls(make, model, modelYear);
  return { vin, decoded: { make, model, modelYear }, recalls };
}
