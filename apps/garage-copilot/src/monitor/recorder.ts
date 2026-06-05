/**
 * Sample live PIDs from an {@link ObdReader} over several rounds into a time
 * series for trend analysis.
 *
 * The clock and the delay between rounds are injected, so the loop is fully
 * deterministic under test (no real waiting). On a real adapter the defaults use
 * the system clock and a real timer.
 */

import type { ObdReader } from "../obd/reader.js";
import type { TimedSample } from "./trends.js";

export type RecorderOptions = {
  /** PID hex codes to sample each round. */
  pids: string[];
  /** Number of sampling rounds. */
  rounds: number;
  /** Delay between rounds in milliseconds. */
  intervalMs?: number;
  /** Clock injection (default Date.now). */
  now?: () => number;
  /** Delay injection (default real setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** Called after each round with the samples collected that round. */
  onRound?: (round: number, samples: TimedSample[]) => void;
};

const realSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Record `rounds` of samples for the given PIDs. Unsupported/failed PIDs are
 * skipped for that round (never abort the recording). Returns the flat,
 * time-ordered series suitable for analyzeTrends().
 */
export async function recordSeries(reader: ObdReader, options: RecorderOptions): Promise<TimedSample[]> {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? realSleep;
  const intervalMs = options.intervalMs ?? 1000;
  const series: TimedSample[] = [];

  for (let round = 0; round < options.rounds; round++) {
    if (round > 0) await sleep(intervalMs);
    const t = now();
    const roundSamples: TimedSample[] = [];
    for (const pid of options.pids) {
      let decoded;
      try {
        decoded = await reader.readLivePid(pid);
      } catch {
        decoded = undefined;
      }
      if (decoded && typeof decoded.value === "number") {
        roundSamples.push({ pid: decoded.pid, label: decoded.label, value: decoded.value, unit: decoded.unit, t });
      }
    }
    series.push(...roundSamples);
    options.onRound?.(round, roundSamples);
  }

  return series;
}
