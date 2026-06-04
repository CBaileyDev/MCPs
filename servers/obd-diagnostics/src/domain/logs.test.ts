import { describe, expect, it } from "vitest";
import { parseScanLog } from "./logs.js";

// ---------------------------------------------------------------------------
// Wide-format Torque CSV fixture (exact real-world export format)
// ---------------------------------------------------------------------------
const TORQUE_WIDE_FIXTURE = `GPS Time,Device Time,Longitude,Latitude,GPS Speed (Meters/second),Altitude (m),Bearing,Engine RPM(rpm),Speed (OBD)(km/h),Engine Coolant Temperature(°C),Intake Air Temperature(°C),Mass Air Flow Rate(g/s),Throttle Position(Manifold)(%)
2024-01-01 12:00:00.000,2024-01-01 12:00:00.000,-74.0,40.7,0.0,10.0,90.0,850,0,89,21,3.45,14.2
`;

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

// ---------------------------------------------------------------------------
// Wide-format CSV (Torque / OBD Fusion / Car Scanner)
// ---------------------------------------------------------------------------
describe("parseScanLog — wide-format CSV (Torque export)", () => {
  it("auto-detects the wide format and emits OBD samples", () => {
    const result = parseScanLog(TORQUE_WIDE_FIXTURE);
    // Should have RPM, Speed, Coolant, IAT, MAF, Throttle — 6 OBD columns
    expect(result.samples.length).toBeGreaterThanOrEqual(6);
  });

  it("extracts Engine RPM with correct label, unit, and numeric value", () => {
    const result = parseScanLog(TORQUE_WIDE_FIXTURE);
    const rpm = result.samples.find(s => s.label === "Engine RPM");
    expect(rpm).toBeDefined();
    expect(rpm?.value).toBe(850);
    expect(rpm?.unit).toBe("rpm");
  });

  it("extracts Engine Coolant Temperature with the embedded unit from the header", () => {
    const result = parseScanLog(TORQUE_WIDE_FIXTURE);
    const coolant = result.samples.find(s => s.label === "Engine Coolant Temperature");
    expect(coolant).toBeDefined();
    expect(coolant?.value).toBe(89);
    expect(coolant?.unit).toBe("°C");
  });

  it("handles nested-paren header: Throttle Position(Manifold)(%) → exact label and unit", () => {
    const result = parseScanLog(TORQUE_WIDE_FIXTURE);
    // The label retains the inner paren group; the unit is stripped from the last paren group.
    const throttle = result.samples.find(s => s.label === "Throttle Position(Manifold)");
    expect(throttle).toBeDefined();
    expect(throttle?.unit).toBe("%");
  });

  it("skips GPS Time, Device Time, Longitude, Latitude, GPS Speed, Altitude, Bearing columns — no samples", () => {
    const result = parseScanLog(TORQUE_WIDE_FIXTURE);
    const labels = result.samples.map(s => s.label.toLowerCase());
    expect(labels.some(l => l.includes("gps time"))).toBe(false);
    expect(labels.some(l => l.includes("device time"))).toBe(false);
    expect(labels.some(l => l.includes("longitude"))).toBe(false);
    expect(labels.some(l => l.includes("latitude"))).toBe(false);
    expect(labels.some(l => l.includes("altitude"))).toBe(false);
    expect(labels.some(l => l.includes("bearing"))).toBe(false);
  });

  it("does NOT warn about the skipped GPS/metadata columns", () => {
    const result = parseScanLog(TORQUE_WIDE_FIXTURE);
    expect(result.warnings).toHaveLength(0);
  });

  it("back-fills the hex pid for Engine RPM (resolves to 0C)", () => {
    const result = parseScanLog(TORQUE_WIDE_FIXTURE);
    const rpm = result.samples.find(s => s.label === "Engine RPM");
    expect(rpm?.pid).toBe("0C");
  });

  it("carries the timestamp from the first time column to each sample", () => {
    const result = parseScanLog(TORQUE_WIDE_FIXTURE);
    expect(result.samples.every(s => s.timestamp === "2024-01-01 12:00:00.000")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-fill: long-format label-only row resolves to hex PID
// ---------------------------------------------------------------------------
describe("parseScanLog — PID back-fill on long CSV", () => {
  it("back-fills pid '05' for a label-only coolant row in long-format CSV", () => {
    const csv = `Timestamp,Label,Value,Unit\n2024-01-15T10:00:00Z,Coolant,92,C\n`;
    const result = parseScanLog(csv, { format: "csv" });
    expect(result.samples.length).toBe(1);
    expect(result.samples[0].pid).toBe("05");
  });

  it("back-fills pid for Engine RPM alias in key:value format", () => {
    const kv = `Engine RPM: 820 rpm\n`;
    const result = parseScanLog(kv, { format: "keyvalue" });
    const rpm = result.samples.find(s => s.label === "Engine RPM");
    expect(rpm).toBeDefined();
    expect(rpm?.pid).toBe("0C");
  });
});
