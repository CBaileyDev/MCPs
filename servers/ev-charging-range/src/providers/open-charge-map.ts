import { fetchJson } from "../http.js";
import { getOcmKey } from "../safety/api-keys.js";
import { fromOcm, type ChargingStation, type OcmPoi } from "../domain/chargers.js";

const OCM_BASE = "https://api.openchargemap.io/v3";

export interface FindNearbyParams {
  lat: number;
  lon: number;
  radiusMiles: number;
  limit: number;
  connector?: string;
}

/**
 * Find nearby EV charging stations via Open Charge Map.
 * Returns an empty array (and skips the API call) if no OCM key is configured.
 */
export async function findNearby(params: FindNearbyParams): Promise<ChargingStation[]> {
  const key = getOcmKey();
  if (!key) {
    // No key configured — silently skip this provider
    return [];
  }

  const { lat, lon, radiusMiles, limit } = params;

  const qs = new URLSearchParams({
    output: "json",
    latitude: String(lat),
    longitude: String(lon),
    distance: String(radiusMiles),
    distanceunit: "Miles",
    maxresults: String(limit),
    key
  });

  const url = `${OCM_BASE}/poi/?${qs.toString()}`;
  const data = await fetchJson<OcmPoi[]>(url);

  return (data ?? []).map(fromOcm);
}
