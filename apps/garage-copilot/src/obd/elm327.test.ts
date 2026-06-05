import { describe, it, expect } from "vitest";
import { Elm327Client, ObdError } from "./elm327.js";
import { ReplayTransport } from "./replay-transport.js";
import { DEMO_VEHICLE } from "./recordings.js";
import type { ObdTransport } from "./transport.js";

function demoClient(): { client: Elm327Client; transport: ReplayTransport } {
  const transport = new ReplayTransport(DEMO_VEHICLE);
  return { client: new Elm327Client(transport), transport };
}

describe("Elm327Client against the demo vehicle", () => {
  it("initializes and reports identity + protocol", async () => {
    const { client, transport } = demoClient();
    const id = await client.initialize();
    expect(id.description).toMatch(/ELM327/);
    expect(id.protocol).toMatch(/ISO 15765-4/);
    // It must turn echo off as part of init.
    expect(transport.sent).toContain("ATE0");
  });

  it("reads monitor status: MIL on, 2 DTCs, spark ignition", async () => {
    const { client } = demoClient();
    const status = await client.readMonitorStatus();
    expect(status.milOn).toBe(true);
    expect(status.dtcCount).toBe(2);
    expect(status.ignitionType).toBe("spark");
  });

  it("reads stored DTCs and decodes them (CAN: count byte skipped)", async () => {
    const { client } = demoClient();
    await client.initialize(); // detects CAN so the Mode-03 count byte is stripped
    expect(await client.readStoredDtcs()).toEqual(["P0301", "P0420"]);
  });

  it("treats NO DATA as no pending/permanent codes", async () => {
    const { client } = demoClient();
    expect(await client.readPendingDtcs()).toEqual([]);
    expect(await client.readPermanentDtcs()).toEqual([]);
  });

  it("reads and decodes live PIDs", async () => {
    const { client } = demoClient();
    expect((await client.readLivePid("0C"))?.value).toBe(812); // RPM
    expect((await client.readLivePid("05"))?.value).toBe(89); // coolant
    expect((await client.readLivePid("42"))?.value).toBe(14.2); // voltage PID
  });

  it("parses ATRV voltage", async () => {
    const { client } = demoClient();
    expect(await client.readVoltage()).toBe(14.2);
  });

  it("serializes concurrent commands so responses don't interleave (half-duplex)", async () => {
    const { client } = demoClient();
    // Fired together; the internal queue must run them one-at-a-time in order so
    // each gets its own clean response rather than a cross-contaminated buffer.
    const [rpm, coolant, volts] = await Promise.all([
      client.readLivePid("0C"),
      client.readLivePid("05"),
      client.readLivePid("42")
    ]);
    expect(rpm?.value).toBe(812);
    expect(coolant?.value).toBe(89);
    expect(volts?.value).toBe(14.2);
  });
});

describe("Elm327Client robustness", () => {
  it("tolerates a command echo when ATE0 has not taken effect", async () => {
    const transport = new ReplayTransport({ "010C": "010C\r41 0C 0C B0" });
    const client = new Elm327Client(transport);
    expect((await client.readLivePid("0C"))?.value).toBe(812);
  });

  it("throws ObdError on a bus failure", async () => {
    const transport = new ReplayTransport({ "0101": "UNABLE TO CONNECT" });
    const client = new Elm327Client(transport);
    await expect(client.readMonitorStatus()).rejects.toBeInstanceOf(ObdError);
  });

  it("reports each transaction to the onTransaction hook", async () => {
    const log: Array<{ cmd: string; lines: string[] }> = [];
    const client = new Elm327Client(new ReplayTransport(DEMO_VEHICLE), {
      onTransaction: (cmd, lines) => log.push({ cmd, lines })
    });
    await client.readLivePid("0C");
    const entry = log.find(e => e.cmd === "010C");
    expect(entry).toBeDefined();
    expect(entry!.lines.join(" ")).toContain("41 0C");
  });

  it("parses packed (spaces-off / ATS0) PID responses", async () => {
    const transport = new ReplayTransport({ "010C": "410C0CB0" });
    const client = new Elm327Client(transport);
    expect((await client.readLivePid("0C"))?.value).toBe(812);
  });

  it("ignores SEARCHING.../status noise lines before the data", async () => {
    const transport = new ReplayTransport({ "0101": "SEARCHING...\r41 01 82 07 21 01" });
    const client = new Elm327Client(transport);
    const status = await client.readMonitorStatus();
    expect(status.milOn).toBe(true);
    expect(status.dtcCount).toBe(2);
  });

  it("returns undefined (not a crash) for an unsupported PID", async () => {
    const transport = new ReplayTransport({ "0110": "NO DATA" });
    const client = new Elm327Client(transport);
    expect(await client.readLivePid("10")).toBeUndefined();
  });

  it("times out when the prompt never arrives", async () => {
    const silent: ObdTransport = {
      description: "silent",
      write: async () => undefined,
      onData: () => () => undefined,
      close: async () => undefined
    };
    const client = new Elm327Client(silent, { timeoutMs: 20 });
    await expect(client.send("0100")).rejects.toThrow(/Timed out/);
  });

  it("honors a per-call timeout override", async () => {
    const silent: ObdTransport = {
      description: "silent",
      write: async () => undefined,
      onData: () => () => undefined,
      close: async () => undefined
    };
    const client = new Elm327Client(silent, { timeoutMs: 60_000 });
    const started = Date.now();
    await expect(client.send("0100", 20)).rejects.toThrow(/after 20ms/);
    expect(Date.now() - started).toBeLessThan(1000); // used the override, not 60s
  });
});
