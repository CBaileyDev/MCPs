import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerObdTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "OBD Diagnostics turns vehicle diagnostic evidence into a normalized, agent-readable trail. It is READ-ONLY (v1): it never clears codes, writes to an ECU, runs active tests, or sends manufacturer-specific commands. Its highest-value capability is parsing user-supplied scan logs (CSV or 'key: value' text from apps like Torque, OBD Fusion, Car Scanner) via ingest_scan_log / normalize_scan_log. A MOCK adapter (obd_connect → obd_read_* ) demonstrates the live-scan tool surface; there is NO live serial/Bluetooth hardware support in this version. DTCs are decoded structurally only (system / generic-vs-manufacturer / subsystem) — no description table is bundled, and readiness summaries are EVIDENCE ONLY and never predict an inspection result. Everything returned is evidence, never a definitive repair diagnosis; always verify against service information.";

export function createObdDiagnosticsMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "obd-diagnostics",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerObdTools(server);
  return server;
}
