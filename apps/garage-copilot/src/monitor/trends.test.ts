import { describe, it, expect } from "vitest";
import { analyzeTrends, summarizeSeries, type TimedSample } from "./trends.js";

function series(pid: string, label: string, values: number[], unit?: string, stepMs = 60000): TimedSample[] {
  return values.map((value, i) => ({ pid, label, value, unit, t: i * stepMs }));
}

describe("summarizeSeries", () => {
  it("computes min/max/avg/first/last and a per-minute slope", () => {
    const stats = summarizeSeries(series("05", "Coolant", [40, 60, 80, 100])); // +20/min
    expect(stats).toHaveLength(1);
    const s = stats[0];
    expect(s.min).toBe(40);
    expect(s.max).toBe(100);
    expect(s.avg).toBe(70);
    expect(s.first).toBe(40);
    expect(s.last).toBe(100);
    expect(s.slopePerMinute).toBeCloseTo(20, 5);
  });

  it("sorts unordered samples by time before computing first/last", () => {
    const unordered: TimedSample[] = [
      { pid: "0C", label: "RPM", value: 900, t: 2000 },
      { pid: "0C", label: "RPM", value: 800, t: 1000 }
    ];
    const s = summarizeSeries(unordered)[0];
    expect(s.first).toBe(800);
    expect(s.last).toBe(900);
  });
});

describe("analyzeTrends flags", () => {
  it("warns on large combined fuel trim", () => {
    const samples = [
      ...series("06", "STFT b1", [12, 13, 14]),
      ...series("07", "LTFT b1", [15, 16, 17])
    ];
    const report = analyzeTrends(samples);
    const trim = report.flags.find(f => f.parameter.startsWith("Fuel trim"));
    expect(trim?.severity).toBe("warn"); // ~28% combined
    expect(trim?.message).toMatch(/lean/);
  });

  it("watches a mild trim and warns on overheat + low charging voltage", () => {
    const samples = [
      ...series("06", "STFT b1", [6, 6, 6]),
      ...series("07", "LTFT b1", [6, 6, 6]), // ~12% -> watch
      ...series("05", "Coolant", [90, 108, 113]), // max 113 -> warn
      ...series("42", "Voltage", [12.4, 12.5, 12.6]) // avg 12.5 -> watch
    ];
    const flags = analyzeTrends(samples).flags;
    expect(flags.find(f => f.parameter.startsWith("Fuel trim"))?.severity).toBe("watch");
    expect(flags.find(f => f.parameter === "Coolant temperature")?.severity).toBe("warn");
    expect(flags.find(f => f.parameter === "Charging voltage")?.severity).toBe("watch");
  });

  it("emits no flags for a healthy series", () => {
    const samples = [
      ...series("06", "STFT b1", [1, -1, 0]),
      ...series("07", "LTFT b1", [2, 1, 1]),
      ...series("05", "Coolant", [88, 90, 91]),
      ...series("42", "Voltage", [14.1, 14.2, 14.2])
    ];
    expect(analyzeTrends(samples).flags).toEqual([]);
  });
});
