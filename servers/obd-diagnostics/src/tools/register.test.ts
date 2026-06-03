import { describe, expect, it } from "vitest";
import { registerObdTools, resetSession } from "./register.js";

/** Minimal structural fake that satisfies ToolRegistrar. */
class FakeMcpServer {
  readonly tools = new Map<string, unknown>();

  registerTool(
    name: string,
    _config: Record<string, unknown>,
    _handler: (input: Record<string, unknown>) => unknown
  ): void {
    this.tools.set(name, { config: _config, handler: _handler });
  }
}

const EXPECTED_TOOLS = [
  "obd_list_adapters",
  "obd_connect",
  "obd_get_status",
  "obd_read_dtcs",
  "obd_read_readiness",
  "obd_read_freeze_frame",
  "obd_read_live_pids",
  "ingest_scan_log",
  "normalize_scan_log",
  "summarize_diagnostic_evidence",
  "suggest_next_diagnostic_steps"
] as const;

describe("registerObdTools", () => {
  it("registers exactly the 11 expected v1 tools", () => {
    const server = new FakeMcpServer();
    registerObdTools(server);
    expect([...server.tools.keys()]).toEqual(EXPECTED_TOOLS);
  });

  it("registers no extra tools beyond the 11", () => {
    const server = new FakeMcpServer();
    registerObdTools(server);
    expect(server.tools.size).toBe(11);
  });
});

describe("obd_list_adapters handler", () => {
  it("returns an adapters array containing at least the mock adapter", async () => {
    const server = new FakeMcpServer();
    registerObdTools(server);
    const tool = server.tools.get("obd_list_adapters") as { handler: (input: Record<string, unknown>) => Promise<{ structuredContent?: { adapters?: unknown[] } }> };
    const result = await tool.handler({});
    expect(result.structuredContent).toBeDefined();
    const content = result.structuredContent as { adapters: Array<{ id: string }> };
    expect(Array.isArray(content.adapters)).toBe(true);
    expect(content.adapters.some(a => a.id === "mock")).toBe(true);
  });
});

describe("obd_connect handler", () => {
  it("connects to the mock adapter and returns session info", async () => {
    resetSession();
    const server = new FakeMcpServer();
    registerObdTools(server);
    const tool = server.tools.get("obd_connect") as { handler: (input: Record<string, unknown>) => Promise<{ structuredContent?: Record<string, unknown> }> };
    const result = await tool.handler({ adapterId: "mock" });
    expect(result.structuredContent).toMatchObject({ connected: true, adapterId: "mock" });
  });

  it("returns connected:false for an unknown adapter id", async () => {
    resetSession();
    const server = new FakeMcpServer();
    registerObdTools(server);
    const tool = server.tools.get("obd_connect") as { handler: (input: Record<string, unknown>) => Promise<{ structuredContent?: Record<string, unknown> }> };
    const result = await tool.handler({ adapterId: "nonexistent" });
    const sc = result.structuredContent as { connected: boolean };
    expect(sc.connected).toBe(false);
  });
});

describe("obd_get_status handler — not connected", () => {
  it("returns connected:false before obd_connect is called", async () => {
    resetSession();
    const server = new FakeMcpServer();
    registerObdTools(server);
    const tool = server.tools.get("obd_get_status") as { handler: (input: Record<string, unknown>) => Promise<{ structuredContent?: Record<string, unknown> }> };
    const result = await tool.handler({});
    expect((result.structuredContent as { connected: boolean }).connected).toBe(false);
  });
});

describe("normalize_scan_log handler", () => {
  it("returns samples from a CSV content string", async () => {
    const server = new FakeMcpServer();
    registerObdTools(server);
    const tool = server.tools.get("normalize_scan_log") as { handler: (input: Record<string, unknown>) => { structuredContent?: Record<string, unknown> } };
    const csv = `Timestamp,Label,Value,Unit\n2024-01-15T10:00:00Z,Engine RPM,820,rpm\n`;
    const result = tool.handler({ content: csv });
    const sc = result.structuredContent as { samples: unknown[] };
    expect(Array.isArray(sc.samples)).toBe(true);
    expect(sc.samples.length).toBe(1);
  });
});

describe("summarize_diagnostic_evidence handler", () => {
  it("returns a caveat string in structured content", async () => {
    const server = new FakeMcpServer();
    registerObdTools(server);
    const tool = server.tools.get("summarize_diagnostic_evidence") as { handler: (input: Record<string, unknown>) => { structuredContent?: Record<string, unknown> } };
    const result = tool.handler({
      dtcs: [{ code: "P0301", source: "test" }],
      milOn: true
    });
    const sc = result.structuredContent as { caveat: string };
    expect(typeof sc.caveat).toBe("string");
    expect(sc.caveat.length).toBeGreaterThan(0);
  });
});
