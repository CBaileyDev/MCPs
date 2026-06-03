import { fetchJson, seg } from "../http.js";
import type { RawVehicleRecord } from "../domain/efficiency.js";

const BASE = "https://www.fueleconomy.gov/ws/rest";

interface MenuItem {
  text: string;
  value: string;
}

interface MenuResponse {
  menuItem: MenuItem | MenuItem[];
}

/** Normalize the menuItem field which may be a single object or an array. */
function normalizeMenuItems(response: MenuResponse): MenuItem[] {
  const mi = response.menuItem;
  if (!mi) return [];
  if (Array.isArray(mi)) return mi;
  return [mi];
}

export interface VehicleOption {
  label: string;
  vehicleId: string;
}

export interface FuelPrices {
  cng: number | null;
  diesel: number | null;
  e85: number | null;
  electric: number | null;
  lpg: number | null;
  midgrade: number | null;
  premium: number | null;
  regular: number | null;
}

function toNum(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/** Get list of makes for a given year. */
export async function getMakes(year: number): Promise<MenuItem[]> {
  const data = await fetchJson<MenuResponse>(`${BASE}/vehicle/menu/make?year=${seg(year)}`);
  return normalizeMenuItems(data);
}

/** Get list of models for a given year and make. */
export async function getModels(year: number, make: string): Promise<MenuItem[]> {
  const data = await fetchJson<MenuResponse>(
    `${BASE}/vehicle/menu/model?year=${seg(year)}&make=${seg(make)}`
  );
  return normalizeMenuItems(data);
}

/** Get list of trim/option combinations for a given year, make, and model.
 *  The `value` in each menuItem is the vehicle ID.
 */
export async function getOptions(year: number, make: string, model: string): Promise<VehicleOption[]> {
  const data = await fetchJson<MenuResponse>(
    `${BASE}/vehicle/menu/options?year=${seg(year)}&make=${seg(make)}&model=${seg(model)}`
  );
  return normalizeMenuItems(data).map(item => ({
    label: item.text,
    vehicleId: item.value
  }));
}

/** Get the raw vehicle record for a given vehicle ID. */
export async function getVehicle(id: string): Promise<RawVehicleRecord> {
  return fetchJson<RawVehicleRecord>(`${BASE}/vehicle/${seg(id)}`);
}

/** Get current national average fuel prices. All values coerced to numbers. */
export async function getFuelPrices(): Promise<FuelPrices> {
  const raw = await fetchJson<Record<string, string>>(`${BASE}/fuelprices`);
  return {
    cng: toNum(raw["cng"]),
    diesel: toNum(raw["diesel"]),
    e85: toNum(raw["e85"]),
    electric: toNum(raw["electric"]),
    lpg: toNum(raw["lpg"]),
    midgrade: toNum(raw["midgrade"]),
    premium: toNum(raw["premium"]),
    regular: toNum(raw["regular"])
  };
}
