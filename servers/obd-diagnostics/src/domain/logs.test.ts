import { describe, expect, it } from "vitest";
import { parseScanLog } from "./logs.js";

// A realistic multi-row CSV with a clean header and a mix of recognized/unknown columns.
const CSV_FIXTURE = `Timestamp,PID,Label,Value,Unit
2024-01-15T10:00:00Z,0C,Engine RPM,820,rpm
2024-01-15T10:00:01Z,0D,Vehicle Speed,0,km/h
2024-01-15T10:00:02Z,05,Engine Coolant Temperature,92,C
2024-01-15T10:00:03Z,11,Throttle Position,14.5,%
`;

describe("parseScanLog — CSV mode", () => {
  it("parses a multi-row CSV into normalized samples without throwing", () => {
    const result = parseScanLog(CSV_FIXTURE, { format: "csv" });
    expect(result.samples.length).toBe(4);
  });

  it("normalizes the RPM sample with canonical label, pid, and numeric value", () => {
    const result = parseScanLog(CSV_FIXTURE, { format: "csv" });
    const rpm = result.samples.find(s => s.pid === "0C");
    expect(rpm).toBeDefined();
    expect(rpm?.label).toBe("Engine RPM");
    expect(typeof rpm?.value).toBe("number");
    expect(rpm?.value).toBe(820);
    expect(rpm?.unit).toBe("rpm");
  });

  it("carries the timestamp through when the column is present", () => {
    const result = parseScanLog(CSV_FIXTURE, { format: "csv" });
    const speed = result.samples.find(s => s.pid === "0D");
    expect(speed?.timestamp).toBe("2024-01-15T10:00:01Z");
  });

  it("does not throw and emits a warning for an unrecognized unit", () => {
    const csv = `Timestamp,Label,Value,Unit\n2024-01-15T10:00:00Z,Boost Pressure,12.5,WTF_UNIT\n`;
    let result: ReturnType<typeof parseScanLog>;
    expect(() => {
      result = parseScanLog(csv, { format: "csv" });
    }).not.toThrow();
    result = parseScanLog(csv, { format: "csv" });
    // The sample should still be present (passed through).
    expect(result.samples.length).toBe(1);
    expect(result.samples[0].value).toBe(12.5);
    // A warning about the unknown unit must be present.
    expect(result.warnings.some(w => w.includes("WTF_UNIT"))).toBe(true);
  });

  it("returns empty samples and a warning for empty content", () => {
    const result = parseScanLog("");
    expect(result.samples).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// A key:value text report with DTC lines and readiness monitor lines.
const KV_FIXTURE = `
DTC: P0301
Pending Codes: P0420
Misfire: Ready
Fuel System: Ready
Components: Ready
Catalyst: Not Ready
Heated Catalyst: Not Supported
Evaporative System: Not Ready
Secondary Air: Not Supported
A/C Refrigerant: Not Supported
Oxygen Sensor: Ready
Oxygen Sensor Heater: Ready
EGR System: Ready
Engine RPM: 820 rpm
`;

describe("parseScanLog — key:value mode", () => {
  it("extracts DTCs from key:value lines", () => {
    const result = parseScanLog(KV_FIXTURE, { format: "keyvalue" });
    const codes = result.dtcs.map(d => d.code);
    expect(codes).toContain("P0301");
    expect(codes).toContain("P0420");
  });

  it("marks the DTC status from the line key", () => {
    const result = parseScanLog(KV_FIXTURE, { format: "keyvalue" });
    const p0301 = result.dtcs.find(d => d.code === "P0301");
    expect(p0301?.status).toBe("stored");
    const p0420 = result.dtcs.find(d => d.code === "P0420");
    expect(p0420?.status).toBe("pending");
  });

  it("builds a readiness snapshot with the correct not-ready count", () => {
    const result = parseScanLog(KV_FIXTURE, { format: "keyvalue" });
    expect(result.readiness).toBeDefined();
    // Catalyst and Evaporative System are not-ready; Not Supported are excluded.
    expect(result.readiness?.notReadyCount).toBe(2);
  });

  it("extracts a PID sample from a plain numeric line", () => {
    const result = parseScanLog(KV_FIXTURE, { format: "keyvalue" });
    const rpm = result.samples.find(s => s.label === "Engine RPM");
    expect(rpm).toBeDefined();
    expect(rpm?.value).toBe(820);
    expect(rpm?.unit).toBe("rpm");
  });

  it("applies the custom source label when provided", () => {
    const result = parseScanLog(KV_FIXTURE, { format: "keyvalue", source: "test-source" });
    expect(result.dtcs.every(d => d.source === "test-source")).toBe(true);
    expect(result.samples.every(s => s.source === "test-source")).toBe(true);
  });
});
