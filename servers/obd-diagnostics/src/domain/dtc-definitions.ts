/**
 * A curated, NON-EXHAUSTIVE set of common GENERIC OBD-II powertrain DTC
 * definitions.
 *
 * These are the standardized generic codes (second character "0") defined by
 * SAE J2012 / ISO 15031-6, whose human-readable meaning is PUBLIC and identical
 * across every manufacturer. That is the key distinction the rest of this module
 * draws: a generic code's meaning is a public standard, whereas a
 * MANUFACTURER-specific code (second character 1/2/3, e.g. P1xxx) is proprietary
 * and varies by make — those are deliberately NOT included here and never will
 * be inferred.
 *
 * Scope is intentionally limited to the most common, unambiguous codes. The
 * absence of a code here means "not in the bundled common set" — NOT "no such
 * code." Callers must look the meaning up in a service database rather than
 * guessing (see `lookupGenericDtcDefinition`, which returns null for anything
 * not listed).
 */
export const COMMON_GENERIC_DTC_DEFINITIONS: Readonly<Record<string, string>> = {
  // Air metering / intake
  P0100: "Mass or Volume Air Flow Circuit Malfunction",
  P0101: "Mass or Volume Air Flow Circuit Range/Performance Problem",
  P0102: "Mass or Volume Air Flow Circuit Low Input",
  P0113: "Intake Air Temperature Sensor 1 Circuit High Input",
  // Coolant temperature / thermostat
  P0117: "Engine Coolant Temperature Circuit Low Input",
  P0118: "Engine Coolant Temperature Circuit High Input",
  P0128: "Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)",
  // Oxygen sensors
  P0131: "O2 Sensor Circuit Low Voltage (Bank 1, Sensor 1)",
  P0135: "O2 Sensor Heater Circuit (Bank 1, Sensor 1)",
  // Fuel trim
  P0171: "System Too Lean (Bank 1)",
  P0172: "System Too Rich (Bank 1)",
  P0174: "System Too Lean (Bank 2)",
  P0175: "System Too Rich (Bank 2)",
  // Misfire
  P0300: "Random/Multiple Cylinder Misfire Detected",
  P0301: "Cylinder 1 Misfire Detected",
  P0302: "Cylinder 2 Misfire Detected",
  P0303: "Cylinder 3 Misfire Detected",
  P0304: "Cylinder 4 Misfire Detected",
  P0305: "Cylinder 5 Misfire Detected",
  P0306: "Cylinder 6 Misfire Detected",
  P0307: "Cylinder 7 Misfire Detected",
  P0308: "Cylinder 8 Misfire Detected",
  // EGR
  P0401: "Exhaust Gas Recirculation Flow Insufficient Detected",
  P0402: "Exhaust Gas Recirculation Flow Excessive Detected",
  // Catalyst
  P0420: "Catalyst System Efficiency Below Threshold (Bank 1)",
  P0430: "Catalyst System Efficiency Below Threshold (Bank 2)",
  // Evaporative emissions
  P0440: "Evaporative Emission Control System Malfunction",
  P0442: "Evaporative Emission Control System Leak Detected (Small Leak)",
  P0446: "Evaporative Emission Control System Vent Control Circuit Malfunction",
  P0455: "Evaporative Emission Control System Leak Detected (Large Leak)",
  // Vehicle speed
  P0500: 'Vehicle Speed Sensor "A"'
};

/**
 * Return the standardized generic definition for a DTC, or `null` when the code
 * is not in the bundled common-generic set (an uncommon generic code, or any
 * manufacturer-specific code). `null` means "look it up in a service database" —
 * never substitute a guess.
 */
export function lookupGenericDtcDefinition(code: string): string | null {
  return COMMON_GENERIC_DTC_DEFINITIONS[code.trim().toUpperCase()] ?? null;
}
