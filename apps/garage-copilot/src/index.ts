/**
 * Garage Copilot — library entry point.
 *
 * Re-exports the OBD bridge, diagnostic/monitor/tune engines, and agent wiring
 * so this package can be embedded in another app (e.g. a Claude Agent SDK host)
 * as well as run via its CLI.
 */

// OBD bridge
export type { ObdTransport } from "./obd/transport.js";
export type { ObdReader, ObdIdentity } from "./obd/reader.js";
export { Elm327Client, ObdError, type Elm327Options } from "./obd/elm327.js";
export { ReplayTransport, normalizeCommand, type ReplayScript } from "./obd/replay-transport.js";
export { openSerialTransport, type SerialOptions } from "./obd/serial-transport.js";
export { DEMO_VEHICLE, DEMO_LIVE_PIDS } from "./obd/recordings.js";
export { SimulatedObdReader, type SimulatorOptions } from "./obd/simulator.js";
export {
  PID_FORMULAS,
  decodePidData,
  lookupFormula,
  normalizePid,
  type DecodedPid,
  type PidFormula
} from "./obd/pid-formulas.js";
export {
  decodeDtcBytes,
  decodeTroubleCodes,
  decodeDtcResponse,
  decodeMonitorStatus,
  parseHexBytes,
  type MonitorStatus,
  type ReadinessMonitor,
  type MonitorState
} from "./obd/dtc-decode.js";
export { decodeVinResponse, isValidVin } from "./obd/vin.js";
export {
  decodeVin,
  validateVin,
  computeCheckDigit,
  decodeModelYear,
  decodeOrigin,
  type VinDecode,
  type VinValidation
} from "./obd/vin-decode.js";
export { decodeSupportedPids } from "./obd/supported-pids.js";
export { convertUnit, type UnitSystem } from "./obd/units.js";

// Diagnose
export { runDiagnosticSession, type DiagnosticSnapshot, type SessionOptions } from "./diagnose/session.js";
export { buildReport, describeDtcStructure, type DiagnosticReport } from "./diagnose/report.js";

// Monitor
export { analyzeTrends, summarizeSeries, type TimedSample, type TrendReport } from "./monitor/trends.js";
export { recordSeries, type RecorderOptions } from "./monitor/recorder.js";

// Tune (read-side advisor)
export {
  assessFinalDriveChange,
  assessInjectorsForTarget,
  assessAddedElectricalLoad,
  type Assessment
} from "./tune/advisor.js";

// Agent wiring
export { buildMcpConfig, renderMcpConfig, knownServers, type McpConfig } from "./agent/mcp-config.js";
export { DIAGNOSTIC_PLAYBOOK, buildSystemPrompt } from "./agent/playbook.js";
