import { describe, expect, it } from "vitest";
import { validateGeoQuery, MAX_RADIUS_METERS } from "./geo.js";

describe("validateGeoQuery", () => {
  it("accepts valid coordinates and radius", () => {
    const result = validateGeoQuery(40.7128, -74.006, 5_000);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.query.center.lat).toBe(40.7128);
      expect(result.query.center.lon).toBe(-74.006);
      expect(result.query.radiusMeters).toBe(5_000);
    }
  });

  it("accepts boundary lat/lon values", () => {
    expect(validateGeoQuery(90, 180, 1_000).valid).toBe(true);
    expect(validateGeoQuery(-90, -180, 1_000).valid).toBe(true);
    expect(validateGeoQuery(0, 0, 1_000).valid).toBe(true);
  });

  it("accepts the maximum radius", () => {
    const result = validateGeoQuery(0, 0, MAX_RADIUS_METERS);
    expect(result.valid).toBe(true);
  });

  it("rejects latitude below -90", () => {
    const result = validateGeoQuery(-91, 0, 1_000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/Latitude/);
  });

  it("rejects latitude above 90", () => {
    const result = validateGeoQuery(91, 0, 1_000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/Latitude/);
  });

  it("rejects longitude below -180", () => {
    const result = validateGeoQuery(0, -181, 1_000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/Longitude/);
  });

  it("rejects longitude above 180", () => {
    const result = validateGeoQuery(0, 181, 1_000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/Longitude/);
  });

  it("rejects zero radius", () => {
    const result = validateGeoQuery(40, -74, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/radiusMeters/);
  });

  it("rejects negative radius", () => {
    const result = validateGeoQuery(40, -74, -100);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/radiusMeters/);
  });

  it("rejects radius exceeding 50 km", () => {
    const result = validateGeoQuery(40, -74, MAX_RADIUS_METERS + 1);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/50/);
  });

  it("rejects NaN lat/lon", () => {
    expect(validateGeoQuery(NaN, 0, 1_000).valid).toBe(false);
    expect(validateGeoQuery(0, NaN, 1_000).valid).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(validateGeoQuery(Infinity, 0, 1_000).valid).toBe(false);
    expect(validateGeoQuery(0, 0, Infinity).valid).toBe(false);
  });
});
