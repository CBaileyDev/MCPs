import { fetchJson } from "../http.js";
import { getAfdcKey, getAfdcBase } from "../safety/api-keys.js";
import { fromAfdc, type ChargingStation, type AfdcStation } from "../domain/chargers.js";

export interface FindNearestParams {
  lat: number;
  lon: number;
  radiusMiles: number;
  limit: number;
  connector?: string;
}

interface AfdcNearestResponse {
  total_results: number;
  fuel_stations: AfdcStation[];
}

interface AfdcByIdResponse {
  alt_fuel_station: AfdcStation;
}

/**
 * Find the nearest EV charging stations using the AFDC API.
 * Returns normalised ChargingStation records.
 */
export async function findNearest(params: FindNearestParams): Promise<{
  stations: ChargingStation[];
  totalResults: number;
  usingDemoKey: boolean;
}> {
  const { lat, lon, radiusMiles, limit, connector } = params;
  const { key, usingDemoKey } = getAfdcKey();
  const base = getAfdcBase();

  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    radius: String(radiusMiles),
    fuel_type: "ELEC",
    limit: String(limit),
    api_key: key
  });

  if (connector) {
    qs.set("ev_connector_type", connector);
  }

  const url = `${base}/nearest.json?${qs.toString()}`;
  const data = await fetchJson<AfdcNearestResponse>(url);

  const stations = (data.fuel_stations ?? []).map(fromAfdc);

  return { stations, totalResults: data.total_results ?? stations.length, usingDemoKey };
}

/**
 * Get a single AFDC charging station by its numeric ID.
 */
export async function getById(id: string): Promise<ChargingStation> {
  const { key } = getAfdcKey();
  const base = getAfdcBase();

  const url = `${base}/${encodeURIComponent(id)}.json?api_key=${encodeURIComponent(key)}`;
  const data = await fetchJson<AfdcByIdResponse>(url);

  return fromAfdc(data.alt_fuel_station);
}
