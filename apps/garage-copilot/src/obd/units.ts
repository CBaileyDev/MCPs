/**
 * Display-unit conversion for OBD values. Decoders always produce SI/metric
 * units (the J1979 standard); this converts a {value, unit} pair to the chosen
 * display system for presentation only — stored/analyzed data stays metric.
 */

export type UnitSystem = "metric" | "imperial";

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Convert a metric value+unit to the display system. Unknown units pass through. */
export function convertUnit(
  value: number,
  unit: string | undefined,
  system: UnitSystem
): { value: number; unit?: string } {
  if (system === "metric" || unit === undefined) return { value, unit };
  switch (unit) {
    case "C":
      return { value: round1((value * 9) / 5 + 32), unit: "F" };
    case "km/h":
      return { value: round1(value * 0.621371), unit: "mph" };
    case "km":
      return { value: round1(value * 0.621371), unit: "mi" };
    case "kPa":
      return { value: round1(value * 0.1450377), unit: "psi" };
    case "L/h":
      return { value: round1(value * 0.2641721), unit: "gal/h" };
    case "g/s":
      return { value: round1(value * 7.93664), unit: "lb/min" };
    default:
      return { value, unit };
  }
}
