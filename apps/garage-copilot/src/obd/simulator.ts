/**
 * A simulated {@link ObdReader} for demos and development.
 *
 * Unlike the replay transport (which returns fixed canned frames to exercise the
 * real driver), this produces time-varying live data — idle RPM wander, a
 * coolant warm-up curve, jittering fuel trims — so the live monitor and its
 * trend analysis have something realistic to chew on with no hardware. The DTCs,
 * readiness, and VIN match the canned demo vehicle so a scan tells a consistent
 * story. Values are illustrative only.
 */

import type { ObdIdentity, ObdReader } from "./reader.js";
import type { DecodedPid } from "./pid-formulas.js";
import { PID_FORMULAS } from "./pid-formulas.js";
import { decodeMonitorStatus, type MonitorStatus } from "./dtc-decode.js";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export type SimulatorOptions = {
  /** Clock injection (default Date.now) for deterministic tests. */
  now?: () => number;
};

export class SimulatedObdReader implements ObdReader {
  private readonly now: () => number;
  private readonly startedAt: number;

  constructor(options: SimulatorOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.startedAt = this.now();
  }

  /** Seconds since the session opened — drives the warm-up/wander curves. */
  private elapsed(): number {
    return (this.now() - this.startedAt) / 1000;
  }

  async initialize(): Promise<ObdIdentity> {
    return { description: "ELM327 v1.5 (simulated)", protocol: "ISO 15765-4 (CAN 11/500)" };
  }

  async readMonitorStatus(): Promise<MonitorStatus> {
    // Same bytes as the canned demo: MIL on, 2 DTCs, catalyst not ready.
    return decodeMonitorStatus([0x82, 0x07, 0x21, 0x01]);
  }

  async readStoredDtcs(): Promise<string[]> {
    return ["P0301", "P0420"];
  }
  async readPendingDtcs(): Promise<string[]> {
    return [];
  }
  async readPermanentDtcs(): Promise<string[]> {
    return [];
  }
  async readVin(): Promise<string | undefined> {
    return "1HGBH41JXMN109186";
  }

  async readVoltage(): Promise<number | undefined> {
    return round2(14.2 + 0.12 * Math.sin(this.elapsed() * 0.5));
  }

  async readLivePid(pid: string): Promise<DecodedPid | undefined> {
    const code = pid.trim().toUpperCase();
    const def = PID_FORMULAS[code];
    if (!def) return undefined;
    const value = this.value(code);
    if (value === undefined) return undefined;
    return { pid: def.pid, label: def.label, value: round2(value), unit: def.unit };
  }

  /** Plausible idle behaviour per PID. */
  private value(code: string): number | undefined {
    const t = this.elapsed();
    const wobble = (hz: number) => Math.sin(t * hz);
    switch (code) {
      case "0C": // RPM — idle wander around ~815
        return 815 + 35 * wobble(1.3) + 8 * wobble(4.1);
      case "0D": // Vehicle speed — parked
        return 0;
      case "05": // Coolant — warm-up curve toward ~92 C
        return Math.min(92, 40 + 52 * (1 - Math.exp(-t / 35))) + 0.6 * wobble(0.2);
      case "0F": // Intake air temp — slowly rising with bay heat
        return 30 + 3 * (1 - Math.exp(-t / 60));
      case "11": // Throttle — closed at idle with tiny jitter
        return 13.5 + 1.2 * wobble(0.6);
      case "06": // STFT — small correction, jittering
        return 2 + 3.5 * wobble(0.9);
      case "07": // LTFT — leaning a touch (matches the demo's "watch" flag)
        return 7 + 1.5 * wobble(0.15);
      case "42": // Module voltage
        return 14.2 + 0.12 * wobble(0.5);
      case "04": // Calculated engine load — light at idle
        return 18 + 5 * wobble(0.8);
      case "0B": // Intake manifold pressure — idle vacuum
        return 33 + 4 * wobble(0.7);
      case "0E": // Timing advance
        return 10 + 4 * wobble(0.5);
      case "10": // Mass air flow — idle
        return 3.2 + 0.6 * wobble(0.9);
      case "2F": // Fuel tank level
        return 62 - t * 0.002;
      case "46": // Ambient air temp
        return 22;
      case "5C": // Oil temp — warms slower than coolant
        return Math.min(98, 40 + 58 * (1 - Math.exp(-t / 55)));
      default:
        return undefined;
    }
  }

  /** The PIDs this simulated ECU "supports" — a realistic spark-ignition set. */
  async readSupportedPids(): Promise<string[]> {
    return ["04", "05", "06", "07", "0B", "0C", "0D", "0E", "0F", "10", "11", "2F", "42", "46", "5C"];
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}
