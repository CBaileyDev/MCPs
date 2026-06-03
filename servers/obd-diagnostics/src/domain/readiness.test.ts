import { describe, expect, it } from "vitest";
import { buildReadinessSnapshot, READINESS_CAVEAT } from "./readiness.js";
import type { ReadinessMonitor } from "./readiness.js";

const SOME_MONITORS: ReadinessMonitor[] = [
  { name: "Misfire", state: "ready" },
  { name: "Fuel System", state: "ready" },
  { name: "Catalyst", state: "not-ready" },
  { name: "Evaporative System", state: "not-ready" },
  { name: "Secondary Air", state: "not-supported" },
  { name: "Oxygen Sensor", state: "ready" }
];

describe("buildReadinessSnapshot", () => {
  it("counts only 'not-ready' monitors — not-supported are excluded", () => {
    const snapshot = buildReadinessSnapshot(SOME_MONITORS);
    // Catalyst + Evaporative System = 2; Secondary Air (not-supported) excluded.
    expect(snapshot.notReadyCount).toBe(2);
  });

  it("returns all monitors in the snapshot unchanged", () => {
    const snapshot = buildReadinessSnapshot(SOME_MONITORS);
    expect(snapshot.monitors).toBe(SOME_MONITORS);
    expect(snapshot.monitors.length).toBe(SOME_MONITORS.length);
  });

  it("reports zero not-ready when all monitors are ready or not-supported", () => {
    const allOk: ReadinessMonitor[] = [
      { name: "Misfire", state: "ready" },
      { name: "Secondary Air", state: "not-supported" }
    ];
    const snapshot = buildReadinessSnapshot(allOk);
    expect(snapshot.notReadyCount).toBe(0);
  });

  it("includes the evidence-only caveat in the summary", () => {
    const snapshot = buildReadinessSnapshot(SOME_MONITORS);
    expect(snapshot.summary).toContain(READINESS_CAVEAT);
  });

  it("summary does NOT claim the vehicle 'will pass' inspection", () => {
    const snapshot = buildReadinessSnapshot(SOME_MONITORS);
    expect(snapshot.summary).not.toMatch(/will pass/i);
  });

  it("summary contains 'does NOT predict' to signal evidence-only framing", () => {
    const snapshot = buildReadinessSnapshot(SOME_MONITORS);
    expect(snapshot.summary).toMatch(/does NOT predict/);
  });

  it("uses singular 'monitor' when exactly one is not-ready", () => {
    const oneNotReady: ReadinessMonitor[] = [
      { name: "Catalyst", state: "not-ready" },
      { name: "Misfire", state: "ready" }
    ];
    const snapshot = buildReadinessSnapshot(oneNotReady);
    expect(snapshot.summary).toMatch(/^1 monitor not ready/);
  });

  it("uses plural 'monitors' when more than one is not-ready", () => {
    const snapshot = buildReadinessSnapshot(SOME_MONITORS);
    expect(snapshot.summary).toMatch(/^2 monitors not ready/);
  });
});
