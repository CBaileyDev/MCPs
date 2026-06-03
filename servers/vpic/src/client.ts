import { fetchJson, seg } from "./http.js";

const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

interface VpicResponse<T> {
  Count: number;
  Message: string;
  Results: T[];
}

/** A decoded VIN as a flat key/value record (vPIC DecodeVinValues format). */
export type DecodedVin = Record<string, string>;

export interface MakeModel {
  Make_ID?: number;
  Make_Name?: string;
  Model_ID?: number;
  Model_Name?: string;
}

export interface Make {
  Make_ID: number;
  Make_Name: string;
}

function dropEmpty(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== "" && v != null));
}

/** Decode a full VIN. `modelYear` improves accuracy when supplied. */
export async function decodeVin(vin: string, modelYear?: number): Promise<DecodedVin> {
  const q = modelYear ? `?format=json&modelyear=${modelYear}` : "?format=json";
  const data = await fetchJson<VpicResponse<DecodedVin>>(`${BASE}/DecodeVinValues/${seg(vin)}${q}`);
  return dropEmpty(data.Results[0] ?? {});
}

/** Decode several VINs in one request (vPIC batch endpoint). */
export async function decodeVinBatch(vins: string[]): Promise<DecodedVin[]> {
  const body = new URLSearchParams({ format: "json", data: vins.join(";") });
  const data = await fetchJson<VpicResponse<DecodedVin>>(`${BASE}/DecodeVINValuesBatch/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  return data.Results.map(dropEmpty);
}

export async function getAllMakes(): Promise<Make[]> {
  const data = await fetchJson<VpicResponse<Make>>(`${BASE}/GetAllMakes?format=json`);
  return data.Results;
}

export async function getModelsForMakeYear(make: string, year: number): Promise<MakeModel[]> {
  const data = await fetchJson<VpicResponse<MakeModel>>(
    `${BASE}/GetModelsForMakeYear/make/${seg(make)}/modelyear/${year}?format=json`
  );
  return data.Results;
}

export async function getVehicleTypesForMake(
  make: string
): Promise<{ VehicleTypeId: number; VehicleTypeName: string }[]> {
  const data = await fetchJson<VpicResponse<{ VehicleTypeId: number; VehicleTypeName: string }>>(
    `${BASE}/GetVehicleTypesForMake/${seg(make)}?format=json`
  );
  return data.Results;
}

export async function decodeWmi(wmi: string): Promise<Record<string, unknown>> {
  const data = await fetchJson<VpicResponse<Record<string, unknown>>>(
    `${BASE}/DecodeWMI/${seg(wmi)}?format=json`
  );
  return data.Results[0] ?? {};
}

export interface ValidationResult {
  valid: boolean;
  make: string;
  model: string;
  modelYear: number;
  canonicalMake?: string;
  canonicalModel?: string;
  message: string;
}

/**
 * Validate a make/model/year combination against vPIC, returning the
 * canonical spelling when the model is found for that make & year.
 */
export async function validateMakeModelYear(
  make: string,
  model: string,
  modelYear: number
): Promise<ValidationResult> {
  const models = await getModelsForMakeYear(make, modelYear);
  if (models.length === 0) {
    return {
      valid: false,
      make,
      model,
      modelYear,
      message: `No models found for make "${make}" in ${modelYear}. Check the make spelling or year.`
    };
  }
  const wanted = model.trim().toLowerCase();
  const match = models.find(m => (m.Model_Name ?? "").trim().toLowerCase() === wanted);
  const canonicalMake = models[0].Make_Name ?? make;
  if (match) {
    return {
      valid: true,
      make,
      model,
      modelYear,
      canonicalMake,
      canonicalModel: match.Model_Name,
      message: `Valid: ${canonicalMake} ${match.Model_Name} ${modelYear}.`
    };
  }
  return {
    valid: false,
    make,
    model,
    modelYear,
    canonicalMake,
    message: `"${model}" was not found for ${canonicalMake} in ${modelYear}. Available models: ${models
      .map(m => m.Model_Name)
      .filter(Boolean)
      .join(", ")}`
  };
}
