/** Returns the AFDC API key and whether we are using the public DEMO_KEY fallback. */
export function getAfdcKey(): { key: string; usingDemoKey: boolean } {
  const key = process.env.AFDC_API_KEY;
  if (key) {
    return { key, usingDemoKey: false };
  }
  return {
    key: "DEMO_KEY",
    usingDemoKey: true
  };
}

/**
 * Returns the Open Charge Map API key, or undefined if not set.
 * When undefined, the OCM provider should be skipped entirely.
 */
export function getOcmKey(): string | undefined {
  return process.env.OPEN_CHARGE_MAP_API_KEY;
}

/** Returns the AFDC base URL (configurable via AFDC_BASE env). */
export function getAfdcBase(): string {
  return process.env.AFDC_BASE ?? "https://developer.nlr.gov/api/alt-fuel-stations/v1";
}
