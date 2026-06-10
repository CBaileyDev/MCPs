/**
 * Re-exports the Garage Copilot engine from its built output, so the GUI reuses
 * the exact same tested OBD driver, decoders, diagnostic/monitor/tune logic that
 * the CLI and library use. Importing from `dist` (real .js) keeps the esbuild
 * browser bundle clean and avoids pulling in the Node-only serial transport.
 */

export { Elm327Client } from "../../../garage-copilot/dist/obd/elm327.js";
export { ReplayTransport } from "../../../garage-copilot/dist/obd/replay-transport.js";
export { SimulatedObdReader } from "../../../garage-copilot/dist/obd/simulator.js";
export { DEMO_VEHICLE, DEMO_LIVE_PIDS } from "../../../garage-copilot/dist/obd/recordings.js";
export { runDiagnosticSession } from "../../../garage-copilot/dist/diagnose/session.js";
export { buildReport } from "../../../garage-copilot/dist/diagnose/report.js";
export { analyzeTrends } from "../../../garage-copilot/dist/monitor/trends.js";
export {
  assessFinalDriveChange,
  assessInjectorsForTarget,
  assessAddedElectricalLoad
} from "../../../garage-copilot/dist/tune/advisor.js";
export { PID_FORMULAS } from "../../../garage-copilot/dist/obd/pid-formulas.js";
export { decodeVin } from "../../../garage-copilot/dist/obd/vin-decode.js";
export type { VinDecode } from "../../../garage-copilot/dist/obd/vin-decode.js";
export { convertUnit } from "../../../garage-copilot/dist/obd/units.js";
export type { UnitSystem } from "../../../garage-copilot/dist/obd/units.js";

export type { ObdTransport } from "../../../garage-copilot/dist/obd/transport.js";
export type { ObdReader } from "../../../garage-copilot/dist/obd/reader.js";
export type { DiagnosticSnapshot } from "../../../garage-copilot/dist/diagnose/session.js";
export type { DiagnosticReport } from "../../../garage-copilot/dist/diagnose/report.js";
export type { TimedSample, TrendReport } from "../../../garage-copilot/dist/monitor/trends.js";
export type { DecodedPid } from "../../../garage-copilot/dist/obd/pid-formulas.js";
export type { Assessment } from "../../../garage-copilot/dist/tune/advisor.js";
