/**
 * Pure trend analysis over a time series of sampled live parameters.
 *
 * This is the "monitor over time" capability: feed it timestamped PID samples
 * (e.g. from a drive recorded by ./recorder.ts) and it produces per-parameter
 * statistics and a few conservative, well-understood health flags (fuel-trim
 * drift, overheat, low charging voltage). Every flag is framed as something to
 * investigate, never a definitive fault. No I/O here.
 */

/** One timestamped sample of a single PID. */
export type TimedSample = {
  pid: string;
  label: string;
  value: number;
  unit?: string;
  /** Epoch milliseconds. */
  t: number;
};

export type SeriesStats = {
  pid: string;
  label: string;
  unit?: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  first: number;
  last: number;
  /** Linear slope in value-units per minute (0 if fewer than 2 samples or no time span). */
  slopePerMinute: number;
};

export type TrendFlag = {
  severity: "info" | "watch" | "warn";
  parameter: string;
  message: string;
};

export type TrendReport = {
  stats: SeriesStats[];
  flags: TrendFlag[];
  caveat: string;
};

const TREND_CAVEAT =
  "Trends are evidence from the supplied samples only. Confirm against service data and a known-good baseline before acting.";

/** SAE J1979 Mode 01 PIDs referenced by the heuristics below. */
const PID = {
  SHORT_TERM_FUEL_TRIM_B1: "06",
  LONG_TERM_FUEL_TRIM_B1: "07",
  COOLANT_TEMP: "05",
  CONTROL_MODULE_VOLTAGE: "42"
} as const;

/** Heuristic thresholds. Conservative and documented; tune in one place. */
const FUEL_TRIM_WATCH_PCT = 10; // combined STFT+LTFT magnitude → "watch"
const FUEL_TRIM_WARN_PCT = 25; // combined STFT+LTFT magnitude → "warn"
const COOLANT_OVERHEAT_C = 110; // sustained peak above this → possible overheat
const CHARGING_MIN_V = 13.0; // average below this with engine running → weak charge

const round = (n: number): number => Math.round(n * 100) / 100;

/** Group samples by PID and compute per-series statistics. */
export function summarizeSeries(samples: TimedSample[]): SeriesStats[] {
  const byPid = new Map<string, TimedSample[]>();
  for (const s of samples) {
    const arr = byPid.get(s.pid) ?? [];
    arr.push(s);
    byPid.set(s.pid, arr);
  }

  const stats: SeriesStats[] = [];
  for (const [pid, group] of byPid) {
    const sorted = [...group].sort((a, b) => a.t - b.t);
    const values = sorted.map(s => s.value);
    const sum = values.reduce((acc, v) => acc + v, 0);
    stats.push({
      pid,
      label: sorted[0].label,
      unit: sorted[0].unit,
      count: sorted.length,
      min: round(Math.min(...values)),
      max: round(Math.max(...values)),
      avg: round(sum / values.length),
      first: sorted[0].value,
      last: sorted[sorted.length - 1].value,
      slopePerMinute: round(slopePerMinute(sorted))
    });
  }
  return stats.sort((a, b) => a.pid.localeCompare(b.pid));
}

/** Least-squares slope of value vs. time, scaled to per-minute. */
function slopePerMinute(sorted: TimedSample[]): number {
  if (sorted.length < 2) return 0;
  const t0 = sorted[0].t;
  const xs = sorted.map(s => (s.t - t0) / 60000); // minutes since start
  const ys = sorted.map(s => s.value);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Average of the latest `window` values for a PID, or undefined if none. */
function recentAvg(stats: SeriesStats | undefined): number | undefined {
  return stats?.avg;
}

/**
 * Analyze a time series: per-PID stats plus conservative health flags.
 *
 * Flags (all heuristics, with caveats):
 * - Fuel trim: combined short+long term average beyond ±10% (watch) / ±25% (warn).
 * - Coolant: sustained above 110 °C (warn — possible overheat).
 * - Charging voltage: average below 13.0 V with engine running (watch — weak charge).
 */
export function analyzeTrends(samples: TimedSample[]): TrendReport {
  const stats = summarizeSeries(samples);
  const byPid = new Map(stats.map(s => [s.pid, s]));
  const flags: TrendFlag[] = [];

  // Fuel trim (bank 1): combine STFT (06) + LTFT (07).
  const stft = recentAvg(byPid.get(PID.SHORT_TERM_FUEL_TRIM_B1));
  const ltft = recentAvg(byPid.get(PID.LONG_TERM_FUEL_TRIM_B1));
  if (stft !== undefined && ltft !== undefined) {
    const total = round(stft + ltft);
    const dir = total > 0 ? "lean (ECU adding fuel)" : "rich (ECU removing fuel)";
    if (Math.abs(total) >= FUEL_TRIM_WARN_PCT) {
      flags.push({
        severity: "warn",
        parameter: "Fuel trim (bank 1)",
        message: `Combined trim ${total > 0 ? "+" : ""}${total}% — strongly ${dir}. Investigate vacuum leaks, MAF, fuel delivery, or O2 sensors.`
      });
    } else if (Math.abs(total) >= FUEL_TRIM_WATCH_PCT) {
      flags.push({
        severity: "watch",
        parameter: "Fuel trim (bank 1)",
        message: `Combined trim ${total > 0 ? "+" : ""}${total}% — mildly ${dir}. Worth watching.`
      });
    }
  }

  // Coolant overheat (05).
  const coolant = byPid.get(PID.COOLANT_TEMP);
  if (coolant && coolant.max >= COOLANT_OVERHEAT_C) {
    flags.push({
      severity: "warn",
      parameter: "Coolant temperature",
      message: `Peaked at ${coolant.max} °C — above a typical ~105 °C ceiling. Check cooling system and thermostat.`
    });
  }

  // Charging voltage (42).
  const volt = byPid.get(PID.CONTROL_MODULE_VOLTAGE);
  if (volt && volt.avg < CHARGING_MIN_V) {
    flags.push({
      severity: "watch",
      parameter: "Charging voltage",
      message: `Averaged ${volt.avg} V — below a healthy ~13.5–14.5 V charging range. Check alternator/belt/battery.`
    });
  }

  return { stats, flags, caveat: TREND_CAVEAT };
}
