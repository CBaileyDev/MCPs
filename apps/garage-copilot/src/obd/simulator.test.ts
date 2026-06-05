import { describe, it, expect } from "vitest";
import { SimulatedObdReader } from "./simulator.js";
import { runDiagnosticSession } from "../diagnose/session.js";

describe("SimulatedObdReader", () => {
  it("reports the demo vehicle's codes, VIN, and readiness", async () => {
    const reader = new SimulatedObdReader();
    expect(await reader.readStoredDtcs()).toEqual(["P0301", "P0420"]);
    expect(await reader.readVin()).toBe("1HGBH41JXMN109186");
    const status = await reader.readMonitorStatus();
    expect(status.milOn).toBe(true);
    expect(status.dtcCount).toBe(2);
    expect(status.monitors.find(m => m.name === "Catalyst")?.state).toBe("not-ready");
  });

  it("produces plausible, varying live values over time", async () => {
    let clock = 0;
    const reader = new SimulatedObdReader({ now: () => clock });

    clock = 0;
    const coolantCold = (await reader.readLivePid("05"))!.value as number;
    clock = 120_000; // two minutes later
    const coolantWarm = (await reader.readLivePid("05"))!.value as number;
    expect(coolantWarm).toBeGreaterThan(coolantCold); // warmed up
    expect(coolantWarm).toBeLessThanOrEqual(93);

    const rpm = (await reader.readLivePid("0C"))!.value as number;
    expect(rpm).toBeGreaterThan(700);
    expect(rpm).toBeLessThan(900);

    expect(await reader.readLivePid("ZZ")).toBeUndefined();
  });

  it("advertises a set of supported PIDs and decodes each one", async () => {
    const reader = new SimulatedObdReader();
    const supported = await reader.readSupportedPids();
    expect(supported).toContain("0C");
    expect(supported.length).toBeGreaterThanOrEqual(12);
    for (const pid of supported) {
      const decoded = await reader.readLivePid(pid);
      expect(decoded, `PID ${pid} should decode`).toBeDefined();
      expect(typeof decoded!.value).toBe("number");
    }
  });

  it("drives a full diagnostic session", async () => {
    const snap = await runDiagnosticSession(new SimulatedObdReader());
    expect(snap.milOn).toBe(true);
    expect(snap.storedDtcs).toEqual(["P0301", "P0420"]);
    expect(snap.vin).toBe("1HGBH41JXMN109186");
    expect(snap.livePids.length).toBeGreaterThan(0);
    expect(snap.warnings).toEqual([]);
  });
});
