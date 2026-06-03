/**
 * OBD-II readiness monitors ("I/M readiness").
 *
 * The monitor NAMES below are the standard public Mode-01 readiness monitors
 * (SAE J1979). The summary this module produces is EVIDENCE ONLY: it reports
 * how many monitors are not ready and explicitly does NOT predict whether a
 * vehicle will pass an emissions inspection.
 */

/** A single readiness monitor and its current state. */
export type ReadinessMonitor = {
  name: string;
  state: "ready" | "not-ready" | "not-supported";
};

/** A readiness snapshot: the monitors, a not-ready count, and a caveated summary. */
export type ReadinessSnapshot = {
  monitors: ReadinessMonitor[];
  notReadyCount: number;
  summary: string;
};

/**
 * Standard public readiness-monitor names (SAE J1979). Order follows the
 * conventional Mode-01 PID 0x01 bit layout. These are public structural
 * labels, not a proprietary table.
 */
export const READINESS_MONITOR_NAMES = [
  "Misfire",
  "Fuel System",
  "Components",
  "Catalyst",
  "Heated Catalyst",
  "Evaporative System",
  "Secondary Air",
  "A/C Refrigerant",
  "Oxygen Sensor",
  "Oxygen Sensor Heater",
  "EGR System"
] as const;

export type ReadinessMonitorName = (typeof READINESS_MONITOR_NAMES)[number];

/** Evidence-only caveat appended to every readiness summary. */
export const READINESS_CAVEAT =
  "This is evidence only and does NOT predict an emissions inspection result; " +
  "confirm against the vehicle and local inspection rules.";

/**
 * Build a readiness snapshot from a set of monitors. Counts only the monitors
 * in the "not-ready" state (not-supported monitors are excluded). The summary
 * states the not-ready count plus the evidence-only caveat and never claims the
 * vehicle "will pass".
 */
export function buildReadinessSnapshot(monitors: ReadinessMonitor[]): ReadinessSnapshot {
  const notReadyCount = monitors.filter(m => m.state === "not-ready").length;
  const summary = `${notReadyCount} monitor${notReadyCount === 1 ? "" : "s"} not ready. ${READINESS_CAVEAT}`;
  return { monitors, notReadyCount, summary };
}
