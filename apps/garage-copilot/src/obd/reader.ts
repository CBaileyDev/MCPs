/**
 * The read-only capability surface the diagnostic/monitor engines depend on.
 *
 * Both the live ELM327 driver (./elm327.ts) and any test/replay double implement
 * this. It is deliberately READ-ONLY: there is no clear-codes, ECU-write, or
 * active-test method anywhere in this interface, mirroring the obd-diagnostics
 * MCP server's read-only v1 boundary.
 */

import type { DecodedPid } from "./pid-formulas.js";
import type { MonitorStatus } from "./dtc-decode.js";

/** Adapter/protocol identity reported after initialization. */
export type ObdIdentity = {
  /** Adapter self-report (e.g. "ELM327 v1.5"). */
  description: string;
  /** Negotiated OBD protocol description (e.g. "ISO 15765-4 (CAN 11/500)"). */
  protocol: string;
};

/** Read-only OBD reader. */
export interface ObdReader {
  /** Reset + configure the adapter and auto-negotiate a protocol. */
  initialize(): Promise<ObdIdentity>;
  /** Mode 01 PID 01: MIL, DTC count, and I/M readiness monitors. */
  readMonitorStatus(): Promise<MonitorStatus>;
  /** Mode 03: confirmed/stored DTC codes. */
  readStoredDtcs(): Promise<string[]>;
  /** Mode 07: pending DTC codes. */
  readPendingDtcs(): Promise<string[]>;
  /** Mode 0A: permanent DTC codes (may be unsupported on older ECUs). */
  readPermanentDtcs(): Promise<string[]>;
  /** Mode 01: read and decode a single live PID (e.g. "0C"). */
  readLivePid(pid: string): Promise<DecodedPid | undefined>;
  /** ATRV: control-module / battery voltage in volts, when available. */
  readVoltage(): Promise<number | undefined>;
  /** Mode 09 PID 02: the VIN, when the ECU supports it. Optional. */
  readVin?(): Promise<string | undefined>;
  /** Mode 01 PID 00/20/…: the live PIDs this ECU supports. Optional. */
  readSupportedPids?(): Promise<string[]>;
  /** Release the underlying transport. */
  close(): Promise<void>;
}
