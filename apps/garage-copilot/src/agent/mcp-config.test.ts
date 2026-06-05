import { describe, it, expect } from "vitest";
import { buildMcpConfig, knownServers, renderMcpConfig } from "./mcp-config.js";

describe("buildMcpConfig", () => {
  it("emits a node entry per known server pointing at its built dist/index.js", () => {
    const config = buildMcpConfig("/abs/path/to/MCPs");
    expect(Object.keys(config.mcpServers).sort()).toEqual([...knownServers()].sort());
    expect(config.mcpServers.vpic).toEqual({
      command: "node",
      args: ["/abs/path/to/MCPs/servers/vpic/dist/index.js"]
    });
  });

  it("attaches the AFDC demo key to ev-charging-range", () => {
    const config = buildMcpConfig("/abs/path/to/MCPs");
    expect(config.mcpServers["ev-charging-range"].env).toEqual({ AFDC_API_KEY: "DEMO_KEY" });
  });

  it("strips a trailing slash from the repo root", () => {
    const config = buildMcpConfig("/abs/path/to/MCPs/");
    expect(config.mcpServers.vpic.args[0]).toBe("/abs/path/to/MCPs/servers/vpic/dist/index.js");
  });

  it("supports limiting to a subset", () => {
    const config = buildMcpConfig("/r", ["vpic", "obd-diagnostics"]);
    expect(Object.keys(config.mcpServers)).toEqual(["vpic", "obd-diagnostics"]);
  });

  it("requires a repo root", () => {
    expect(() => buildMcpConfig("")).toThrow(/repoRoot/);
  });

  it("renders valid JSON", () => {
    const parsed = JSON.parse(renderMcpConfig("/r", ["vpic"]));
    expect(parsed.mcpServers.vpic.command).toBe("node");
  });
});
