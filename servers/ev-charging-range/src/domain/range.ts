/** Input parameters for the conservative range margin estimate. */
export interface RangeMarginInput {
  /** Trip distance in miles. */
  tripMiles: number;
  /** Starting state of charge as a percentage (0-100). */
  startSocPercent: number;
  /**
   * Battery pack capacity in kWh. Used together with efficiencyMiPerKwh
   * to compute range. Takes precedence over epaRangeMiles when both supplied.
   */
  batteryKwh?: number;
  /**
   * Efficiency in miles per kWh. Required when batteryKwh is provided.
   * Used with batteryKwh to compute range.
   */
  efficiencyMiPerKwh?: number;
  /**
   * EPA rated range in miles at 100% SOC. Used when batteryKwh/efficiency
   * are not both supplied.
   */
  epaRangeMiles?: number;
  /**
   * Target reserve SOC % to maintain at destination (default 10%).
   * The reserve protects against uncertainty.
   */
  targetReservePercent?: number;
  /**
   * Conservative derate % applied to rated range to account for real-world
   * factors like cold weather, highway speeds, AC/heat use, load, elevation.
   * Default 0 (caller chooses; 10-20% is common).
   */
  deratePercent?: number;
}

/** Risk classification for the route. */
export type RangeRisk = "ok" | "tight" | "insufficient";

/** Output of the conservative range margin estimate. */
export interface RangeMarginResult {
  /** Estimated usable range from start SOC after derate, in miles. */
  usableRangeMiles: number;
  /**
   * Estimated SOC % upon arrival (before reserve consideration).
   * May be negative if the trip is not feasible.
   */
  arrivalSocPercent: number;
  /**
   * Miles remaining above the reserve target at destination.
   * Negative means the reserve is not met.
   */
  marginMiles: number;
  /** Whether the trip finishes within the target reserve (marginMiles >= 0). */
  withinReserve: boolean;
  /** Risk classification. ok: comfortable margin; tight: reserve barely met; insufficient: not feasible. */
  risk: RangeRisk;
  /** Echo of every input used in the calculation — for transparency and verification. */
  assumptions: Record<string, unknown>;
  /** Caveats about the estimate's limitations. */
  caveats: string[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Estimate the range margin for a trip.
 *
 * Precedence: if both batteryKwh AND efficiencyMiPerKwh are provided, we use
 * batteryKwh × efficiencyMiPerKwh as the full-charge rated range.
 * Otherwise we use epaRangeMiles. One of the two paths must be available.
 */
export function estimateRangeMargin(input: RangeMarginInput): RangeMarginResult {
  const {
    tripMiles,
    startSocPercent,
    batteryKwh,
    efficiencyMiPerKwh,
    epaRangeMiles,
    targetReservePercent = 10,
    deratePercent = 0
  } = input;

  const caveats: string[] = [
    "All estimates are conservative approximations. Actual range varies with temperature, speed, driving style, elevation, HVAC use, and load.",
    "Status of charging stations is source-reported and may be stale — verify before relying.",
    "This estimate is for planning purposes only. Do not rely on it as a guarantee of range sufficiency."
  ];

  const assumptions: Record<string, unknown> = {
    tripMiles,
    startSocPercent,
    targetReservePercent,
    deratePercent
  };

  // Determine full-charge rated range
  let ratedRangeMiles: number;
  let rangeSource: string;

  if (batteryKwh != null && efficiencyMiPerKwh != null) {
    ratedRangeMiles = batteryKwh * efficiencyMiPerKwh;
    rangeSource = "batteryKwh × efficiencyMiPerKwh";
    assumptions["batteryKwh"] = batteryKwh;
    assumptions["efficiencyMiPerKwh"] = efficiencyMiPerKwh;
    assumptions["ratedRangeMilesFromBattery"] = round1(ratedRangeMiles);
    if (epaRangeMiles != null) {
      caveats.push(
        `epaRangeMiles (${epaRangeMiles} mi) was provided but batteryKwh+efficiency takes precedence.`
      );
    }
  } else if (epaRangeMiles != null) {
    ratedRangeMiles = epaRangeMiles;
    rangeSource = "epaRangeMiles";
    assumptions["epaRangeMiles"] = epaRangeMiles;
    if (batteryKwh != null && efficiencyMiPerKwh == null) {
      caveats.push("batteryKwh provided without efficiencyMiPerKwh; falling back to epaRangeMiles.");
      assumptions["batteryKwh"] = batteryKwh;
    }
    if (efficiencyMiPerKwh != null && batteryKwh == null) {
      caveats.push("efficiencyMiPerKwh provided without batteryKwh; falling back to epaRangeMiles.");
      assumptions["efficiencyMiPerKwh"] = efficiencyMiPerKwh;
    }
  } else {
    // Neither path available — return a safe "insufficient" with clear caveat
    caveats.push(
      "Could not determine rated range: supply either (batteryKwh + efficiencyMiPerKwh) or epaRangeMiles."
    );
    return {
      usableRangeMiles: 0,
      arrivalSocPercent: 0,
      marginMiles: -tripMiles,
      withinReserve: false,
      risk: "insufficient",
      assumptions,
      caveats
    };
  }

  assumptions["rangeSource"] = rangeSource;

  // Apply derate for real-world conditions
  const deratedRangeMiles = ratedRangeMiles * (1 - deratePercent / 100);
  assumptions["deratedRatedRangeMiles"] = round1(deratedRangeMiles);

  // Available range from starting SOC
  const availableRangeMiles = deratedRangeMiles * (startSocPercent / 100);
  const usableRangeMiles = round1(availableRangeMiles);
  assumptions["usableRangeMilesFromStartSoc"] = usableRangeMiles;

  // Reserve in miles (based on derated range at 100% SOC for consistency)
  const reserveMiles = deratedRangeMiles * (targetReservePercent / 100);
  assumptions["reserveMiles"] = round1(reserveMiles);

  // Margin: available - trip - reserve
  const marginMiles = round1(availableRangeMiles - tripMiles - reserveMiles);
  const withinReserve = marginMiles >= 0;

  // Arrival SOC: how much of derated range is left after the trip (before reserve)
  const remainingAfterTrip = availableRangeMiles - tripMiles;
  const arrivalSocPercent = round1((remainingAfterTrip / deratedRangeMiles) * 100);

  // Risk classification
  let risk: RangeRisk;
  if (!withinReserve) {
    risk = "insufficient";
  } else if (marginMiles < reserveMiles * 0.5) {
    // Tight: margin is less than half the reserve buffer
    risk = "tight";
  } else {
    risk = "ok";
  }

  return {
    usableRangeMiles,
    arrivalSocPercent,
    marginMiles,
    withinReserve,
    risk,
    assumptions,
    caveats
  };
}
