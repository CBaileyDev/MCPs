/** Maximum allowed radius in meters (50 km). */
export const MAX_RADIUS_METERS = 50_000;

export interface GeoCenter {
  lat: number;
  lon: number;
}

export interface GeoQuery {
  center: GeoCenter;
  radiusMeters: number;
}

export type GeoValidationResult =
  | { valid: true; query: GeoQuery }
  | { valid: false; reason: string };

/**
 * Validate a center + radius geographic query.
 *
 * Rules:
 *  - lat must be in [-90, 90]
 *  - lon must be in [-180, 180]
 *  - radiusMeters must be > 0 and <= MAX_RADIUS_METERS (50 km)
 */
export function validateGeoQuery(
  lat: number,
  lon: number,
  radiusMeters: number
): GeoValidationResult {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { valid: false, reason: `Latitude must be between -90 and 90; got ${lat}.` };
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { valid: false, reason: `Longitude must be between -180 and 180; got ${lon}.` };
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return { valid: false, reason: `radiusMeters must be a positive number; got ${radiusMeters}.` };
  }
  if (radiusMeters > MAX_RADIUS_METERS) {
    return {
      valid: false,
      reason: `radiusMeters must not exceed ${MAX_RADIUS_METERS} (50 km); got ${radiusMeters}.`,
    };
  }
  return { valid: true, query: { center: { lat, lon }, radiusMeters } };
}
