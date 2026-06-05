import { describe, it, expect } from "vitest";
import { toCsv, lineSeverityClass, dtcSearchUrl, dtcCodeInLine, boundedPush } from "./format.js";
import type { TimedSample } from "./core.js";

describe("boundedPush", () => {
  it("keeps only the most recent `max` items", () => {
    const buf: number[] = [];
    for (let i = 0; i < 10; i++) boundedPush(buf, i, 3);
    expect(buf).toEqual([7, 8, 9]);
  });
  it("does not trim below max", () => {
    const buf: number[] = [];
    boundedPush(buf, 1, 5);
    boundedPush(buf, 2, 5);
    expect(buf).toEqual([1, 2]);
  });
});

describe("toCsv", () => {
  it("builds a header + rows and escapes quotes in labels", () => {
    const samples: TimedSample[] = [
      { pid: "0C", label: "Engine RPM", value: 812, unit: "rpm", t: 0 },
      { pid: "05", label: 'Coolant "ECT"', value: 89, unit: "C", t: 60000 }
    ];
    const lines = toCsv(samples).split("\n");
    expect(lines[0]).toBe("time_iso,pid,label,value,unit");
    expect(lines[1]).toBe("1970-01-01T00:00:00.000Z,0C,\"Engine RPM\",812,rpm");
    expect(lines[2]).toContain('"Coolant ""ECT"""'); // doubled quotes
  });
});

describe("lineSeverityClass", () => {
  it("classifies readiness, MIL, and neutral lines", () => {
    expect(lineSeverityClass("✓ Misfire: ready")).toBe("row row--ok");
    expect(lineSeverityClass("✗ Catalyst: not-ready")).toBe("row row--warn");
    expect(lineSeverityClass("MIL (check-engine light): ON")).toBe("row row--warn");
    expect(lineSeverityClass("Engine type: spark-ignition")).toBe("row");
  });
});

describe("dtcCodeInLine / dtcSearchUrl", () => {
  it("extracts a DTC code from a line", () => {
    expect(dtcCodeInLine("  • P0301 — Powertrain, generic, misfire")).toBe("P0301");
    expect(dtcCodeInLine("Pending: none")).toBeUndefined();
  });
  it("builds a search URL for a code", () => {
    expect(dtcSearchUrl("P0420")).toContain("P0420");
    expect(dtcSearchUrl("P0420")).toMatch(/^https:\/\//);
  });
});
