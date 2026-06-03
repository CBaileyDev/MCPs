import { fetchJson, seg } from "./http.js";

const BASE = "https://api.nhtsa.gov";

interface NhtsaResponse<T> {
  count?: number;
  results?: T[];
  Count?: number;
  Results?: T[];
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
