import { describe, it, expect, vi } from "vitest";
import { recordSeries } from "./recorder.js";
import type { ObdReader } from "../obd/reader.js";
import type { DecodedPid } from "../obd/pid-formulas.js";

function countingReader(): ObdReader {
  let rpm = 800;
  return {
    initialize: async () => ({ description: "fake", protocol: "test" }),
    readMonitorStatus: async () => ({ milOn: false, dtcCount: 0, ignitionType: "spark", monitors: [] }),
    readStoredDtcs: async () => [],
    readPendingDtcs: async () => [],
    readPermanentDtcs: async () => [],
    readLivePid: async (pid: string): Promise<DecodedPid | undefined> => {
      if (pid === "0C") {
        rpm += 100;
        return { pid: "0C", label: "Engine RPM", value: rpm, unit: "rpm" };
      }
      if (pid === "ZZ") return undefined; // unsupported -> skipped
      return { pid, label: pid, value: 1, unit: undefined };
    },
    readVoltage: async () => undefined,
    close: async () => undefined
  };
}

describe("recordSeries", () => {
  it("samples each PID per round with injected clock and no real waiting", async () => {
    const sleep = vi.fn(async () => undefined);
    let tick = 0;
    const now = () => tick++ * 1000;
    const onRound = vi.fn();

    const series = await recordSeries(countingReader(), {
      pids: ["0C", "ZZ"],
      rounds: 3,
      intervalMs: 500,
      now,
      sleep,
      onRound
    });

    // Only "0C" yields samples (ZZ is unsupported) -> 3 samples total.
    expect(series).toHaveLength(3);
    expect(series.map(s => s.value)).toEqual([900, 1000, 1100]);
    expect(series.map(s => s.t)).toEqual([0, 1000, 2000]);
    // sleep called between rounds only (rounds-1 times).
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(onRound).toHaveBeenCalledTimes(3);
  });

  it("does not throw if a PID read rejects", async () => {
    const reader = countingReader();
    reader.readLivePid = async () => {
      throw new Error("boom");
    };
    const series = await recordSeries(reader, { pids: ["0C"], rounds: 2, sleep: async () => undefined });
    expect(series).toEqual([]);
  });
});
