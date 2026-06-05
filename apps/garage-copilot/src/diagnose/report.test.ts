import { describe, it, expect } from "vitest";
import { buildReport, describeDtcStructure } from "./report.js";
import type { DiagnosticSnapshot } from "./session.js";

const snapshot: DiagnosticSnapshot = {
  capturedAt: "2026-01-01T00:00:00.000Z",
  identity: { description: "ELM327 v1.5", protocol: "ISO 15765-4 (CAN 11/500)" },
  milOn: true,
  reportedDtcCount: 2,
  ignitionType: "spark",
  storedDtcs: ["P0301", "P0420"],
  pendingDtcs: [],
  permanentDtcs: [],
  readiness: [
    { name: "Misfire", state: "ready" },
    { name: "Catalyst", state: "not-ready" },
    { name: "EGR System", state: "not-supported" }
  ],
  notReadyMonitors: ["Catalyst"],
  livePids: [{ pid: "0C", label: "Engine RPM", value: 812, unit: "rpm" }],
  voltage: 14.2,
  warnings: []
};

describe("describeDtcStructure", () => {
  it("decodes system / kind / area from the code shape", () => {
    expect(describeDtcStructure("P0301")).toBe("Powertrain, generic, ignition system or misfire");
    expect(describeDtcStructure("P1301")).toContain("manufacturer-specific");
    expect(describeDtcStructure("U0100")).toContain("Network");
  });
  it("flags an unrecognized format", () => {
    expect(describeDtcStructure("XYZ")).toBe("unrecognized code format");
  });
});

describe("buildReport", () => {
  it("produces a headline, all sections, and caveats", () => {
    const report = buildReport(snapshot, "2014 Subaru Forester");
    expect(report.headline).toContain("MIL ON");
    expect(report.headline).toContain("2 confirmed DTCs");
    const titles = report.sections.map(s => s.title);
    expect(titles).toContain("Overview");
    expect(titles).toContain("Diagnostic Trouble Codes");
    expect(titles.some(t => t.startsWith("I/M Readiness"))).toBe(true);
    expect(report.caveats.some(c => /read-only/i.test(c))).toBe(true);
  });

  it("converts live values to imperial when requested", () => {
    const snap = { ...snapshot, livePids: [{ pid: "05", label: "Engine Coolant Temperature", value: 100, unit: "C" }] };
    expect(buildReport(snap).text).toContain("Engine Coolant Temperature: 100 C");
    expect(buildReport(snap, undefined, "imperial").text).toContain("Engine Coolant Temperature: 212 F");
  });

  it("renders DTCs with structural decode and hides unsupported monitors", () => {
    const report = buildReport(snapshot);
    expect(report.text).toContain("P0301 — Powertrain, generic, ignition system or misfire");
    expect(report.text).not.toContain("EGR System"); // not-supported is hidden
    expect(report.text).toContain("Engine RPM: 812 rpm");
  });
});
