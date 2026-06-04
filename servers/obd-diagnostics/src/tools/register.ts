import * as z from "zod/v4";
import { ok, type ToolResult } from "../result.js";
import { decodeDtcStructure, parseDtc, type DtcRecord } from "../domain/dtc.js";
import type { ReadinessSnapshot } from "../domain/readiness.js";
import type { PidSample } from "../domain/pids.js";
import { parseScanLog } from "../domain/logs.js";
import {
  summarizeEvidence,
  suggestNextSteps,
  type DiagnosticEvidence
} from "../domain/summary.js";
import {
  getAdapter,
  listAdapters,
  MockObdAdapter,
  type AdapterStatus,
  type FreezeFrame,
  type ObdAdapter,
  type SessionInfo
} from "../providers/serial.js";
import { ingestScanLog } from "../providers/log-file.js";

/**
 * Minimal structural type the real McpServer satisfies. Typing the registrar
 * structurally (rather than importing McpServer) lets the registration tests
 * pass a lightweight fake while keeping ok()'s ToolResult assignable.
 */
type ToolRegistrar = {
  registerTool(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: z.ZodRawShape;
      annotations?: Record<string, unknown>;
    },
    handler: (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult
  ): unknown;
};

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const MUTATING = { readOnlyHint: false, openWorldHint: false } as const;

const NOT_CONNECTED_MESSAGE =
  "Not connected — call obd_connect first (defaults to the mock adapter; live hardware is not implemented in v1).";

/**
 * In-memory session. The stdio process persists across tool calls, so a session
 * opened by obd_connect survives subsequent reads. It starts null: read tools
 * report NOT_CONNECTED_MESSAGE until obd_connect is called.
 */
type Session = { adapter: ObdAdapter; info: SessionInfo };
let currentSession: Session | null = null;

/** For tests: reset module-level session state between cases. */
export function resetSession(): void {
  currentSession = null;
}

/** Attach a structural decode to each DTC that has a valid code. */
function withStructure(dtcs: DtcRecord[]): Array<DtcRecord & { structure?: ReturnType<typeof decodeDtcStructure> }> {
  return dtcs.map(dtc => {
    const normalized = parseDtc(dtc.code);
    if (!normalized) return { ...dtc };
    return { ...dtc, code: normalized, structure: decodeDtcStructure(normalized) };
  });
}

/** Coerce a loose evidence input (or an inline log) into DiagnosticEvidence. */
function toEvidence(input: Record<string, unknown>): DiagnosticEvidence {
  if (typeof input.content === "string" && input.content.trim() !== "") {
    const parsed = parseScanLog(input.content, {
      format: typeof input.format === "string" ? (input.format as "csv" | "keyvalue" | "auto") : undefined
    });
    return { dtcs: parsed.dtcs, readiness: parsed.readiness, samples: parsed.samples };
  }
  const evidence: DiagnosticEvidence = {};
  if (Array.isArray(input.dtcs)) evidence.dtcs = input.dtcs as DtcRecord[];
  if (input.readiness && typeof input.readiness === "object") {
    evidence.readiness = input.readiness as ReadinessSnapshot;
  }
  if (Array.isArray(input.samples)) evidence.samples = input.samples as PidSample[];
  if (typeof input.milOn === "boolean") evidence.milOn = input.milOn;
  return evidence;
}

const dtcRecordSchema = z.object({
  code: z.string(),
  status: z.enum(["stored", "pending", "permanent"]).optional(),
  module: z.string().optional(),
  description: z.string().optional(),
  source: z.string().default("caller")
});

const pidSampleSchema = z.object({
  pid: z.string().optional(),
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  timestamp: z.string().optional(),
  source: z.string().default("caller")
});

const readinessMonitorSchema = z.object({
  name: z.string(),
  state: z.enum(["ready", "not-ready", "not-supported"])
});

const readinessSnapshotSchema = z.object({
  monitors: z.array(readinessMonitorSchema),
  notReadyCount: z.number(),
  summary: z.string()
});

const evidenceFields = {
  content: z.string().optional(),
  format: z.enum(["csv", "keyvalue", "auto"]).optional(),
  dtcs: z.array(dtcRecordSchema).optional(),
  readiness: readinessSnapshotSchema.optional(),
  samples: z.array(pidSampleSchema).optional(),
  milOn: z.boolean().optional()
} satisfies z.ZodRawShape;

export function registerObdTools(server: ToolRegistrar): void {
  // --- Adapter / session -------------------------------------------------
  server.registerTool(
    "obd_list_adapters",
    {
      title: "List OBD Adapters",
      description:
        "List adapters this server can use. Only a mock (simulated ELM327) adapter is available in v1; live serial/Bluetooth hardware is explicitly not implemented.",
      inputSchema: {},
      annotations: READ_ONLY
    },
    () =>
      ok({
        adapters: listAdapters(),
        note: "Live serial/Bluetooth hardware is not implemented in v1 (no native serial dependency). Use the mock adapter or ingest a scan log."
      })
  );

  server.registerTool(
    "obd_connect",
    {
      title: "Connect OBD Adapter",
      description:
        "Open a diagnostic session against an adapter (defaults to the mock adapter). Sets the in-memory current session used by the read tools. Connecting to live hardware is not supported in v1.",
      inputSchema: {
        adapterId: z.string().default("mock")
      },
      // The only mutating tool: it changes in-memory session state.
      annotations: MUTATING
    },
    async input => {
      const adapterId = typeof input.adapterId === "string" && input.adapterId.trim() !== ""
        ? input.adapterId.trim()
        : "mock";
      const adapter = getAdapter(adapterId);
      if (!adapter) {
        return ok({
          connected: false,
          adapterId,
          message:
            adapterId === "serial"
              ? "The 'serial' adapter is not implemented in v1 (no native serial dependency). Use adapterId 'mock'."
              : `Unknown adapter '${adapterId}'. Available: 'mock'.`
        });
      }
      const info = await adapter.connect();
      currentSession = { adapter, info };
      return ok({ ...info, message: "Connected to mock adapter (simulated; no live hardware)." });
    }
  );

  // --- Session reads -----------------------------------------------------
  server.registerTool(
    "obd_get_status",
    {
      title: "Get OBD Status",
      description:
        "Read overall status from the current session: MIL (check-engine-light) on/off, DTC count, ignition state, and module/battery voltage. Requires a session (call obd_connect).",
      inputSchema: {},
      annotations: READ_ONLY
    },
    async () => {
      if (!currentSession) return ok({ connected: false, message: NOT_CONNECTED_MESSAGE });
      const status: AdapterStatus = await currentSession.adapter.getStatus();
      return ok({ connected: true, adapterId: currentSession.info.adapterId, ...status });
    }
  );

  server.registerTool(
    "obd_read_dtcs",
    {
      title: "Read DTCs",
      description:
        "Read stored/pending DTCs from the current session, each with a structural decode (system letter, generic vs manufacturer, subsystem) plus a standardized definition for common generic codes (structure.genericDescription). genericDescription is null for manufacturer-specific and uncommon codes — look those up rather than guessing. Requires a session.",
      inputSchema: {},
      annotations: READ_ONLY
    },
    async () => {
      if (!currentSession) return ok({ connected: false, message: NOT_CONNECTED_MESSAGE });
      const dtcs = await currentSession.adapter.readDtcs();
      return ok({ connected: true, dtcs: withStructure(dtcs) });
    }
  );

  server.registerTool(
    "obd_read_readiness",
    {
      title: "Read Readiness Monitors",
      description:
        "Read I/M readiness monitors and a summary from the current session. The summary is EVIDENCE ONLY and does not predict an emissions inspection result. Requires a session.",
      inputSchema: {},
      annotations: READ_ONLY
    },
    async () => {
      if (!currentSession) return ok({ connected: false, message: NOT_CONNECTED_MESSAGE });
      const readiness: ReadinessSnapshot = await currentSession.adapter.readReadiness();
      return ok({ connected: true, ...readiness });
    }
  );

  server.registerTool(
    "obd_read_freeze_frame",
    {
      title: "Read Freeze Frame",
      description:
        "Read the freeze-frame snapshot (parameter values captured when a DTC set) from the current session. Requires a session.",
      inputSchema: {},
      annotations: READ_ONLY
    },
    async () => {
      if (!currentSession) return ok({ connected: false, message: NOT_CONNECTED_MESSAGE });
      const frame: FreezeFrame = await currentSession.adapter.readFreezeFrame();
      return ok({ connected: true, ...frame });
    }
  );

  server.registerTool(
    "obd_read_live_pids",
    {
      title: "Read Live PIDs",
      description:
        "Sample live PID values from the current session. Optionally pass a list of PID hex codes (e.g. ['0C','0D']) to filter. Requires a session.",
      inputSchema: {
        pids: z.array(z.string()).optional()
      },
      annotations: READ_ONLY
    },
    async input => {
      if (!currentSession) return ok({ connected: false, message: NOT_CONNECTED_MESSAGE });
      const pids = Array.isArray(input.pids) ? (input.pids as string[]) : undefined;
      const samples = await currentSession.adapter.readLivePids(pids);
      return ok({ connected: true, samples });
    }
  );

  // --- Log ingestion / normalization ------------------------------------
  server.registerTool(
    "ingest_scan_log",
    {
      title: "Ingest Scan Log",
      description:
        "Parse a user-supplied scan log (CSV or 'key: value' text from apps like Torque/OBD Fusion/Car Scanner) into normalized samples, DTCs (with structural decode and a standardized definition for common generic codes; null for manufacturer-specific codes), an optional readiness snapshot, and warnings. Provide `content` (raw text) or an explicit `path` to read.",
      inputSchema: {
        content: z.string().optional(),
        path: z.string().optional(),
        format: z.enum(["csv", "keyvalue", "auto"]).optional()
      },
      annotations: READ_ONLY
    },
    async input => {
      const parsed = await ingestScanLog({
        content: typeof input.content === "string" ? input.content : undefined,
        path: typeof input.path === "string" ? input.path : undefined,
        format: typeof input.format === "string" ? (input.format as "csv" | "keyvalue" | "auto") : undefined
      });
      return ok({
        samples: parsed.samples,
        dtcs: withStructure(parsed.dtcs),
        readiness: parsed.readiness,
        warnings: parsed.warnings
      });
    }
  );

  server.registerTool(
    "normalize_scan_log",
    {
      title: "Normalize Scan Log",
      description:
        "Normalize raw scan-log `content` into canonical PID labels/units and surface any warnings (unknown columns/units are passed through, never dropped silently). Returns samples and warnings.",
      inputSchema: {
        content: z.string(),
        format: z.enum(["csv", "keyvalue", "auto"]).optional()
      },
      annotations: READ_ONLY
    },
    input => {
      const content = typeof input.content === "string" ? input.content : "";
      const parsed = parseScanLog(content, {
        format: typeof input.format === "string" ? (input.format as "csv" | "keyvalue" | "auto") : undefined
      });
      return ok({ samples: parsed.samples, warnings: parsed.warnings });
    }
  );

  // --- Evidence reasoning ------------------------------------------------
  server.registerTool(
    "summarize_diagnostic_evidence",
    {
      title: "Summarize Diagnostic Evidence",
      description:
        "Summarize supplied diagnostic evidence (dtcs/readiness/samples/milOn, or an inline log `content`): MIL status, DTC count grouped by affected system, readiness state, and what evidence is missing. Returns evidence, NOT a repair diagnosis.",
      inputSchema: evidenceFields,
      annotations: READ_ONLY
    },
    input => ok(summarizeEvidence(toEvidence(input)))
  );

  server.registerTool(
    "suggest_next_diagnostic_steps",
    {
      title: "Suggest Next Diagnostic Steps",
      description:
        "From supplied evidence (dtcs/readiness/samples or an inline log `content`), return conservative, generic next steps grouped by affected system. Each step is framed as something to verify with service information, never a confirmed fix or a specific part.",
      inputSchema: evidenceFields,
      annotations: READ_ONLY
    },
    input => ok(suggestNextSteps(toEvidence(input)))
  );
}

/** Exposed for callers that want the default adapter directly. */
export { MockObdAdapter };
