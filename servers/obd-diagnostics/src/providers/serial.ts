/**
 * OBD adapter provider interface and a MOCK implementation.
 *
 * IMPORTANT: there is NO real serial / Bluetooth I/O in v1. A live ELM327-style
 * adapter would require a native module (e.g. `serialport`), which this server
 * deliberately does not depend on. `ObdAdapter` defines the read-only tool
 * surface; `MockObdAdapter` returns realistic canned data so the tools work in
 * a session without hardware. The live path is an explicitly-unimplemented
 * boundary — see listAdapters().
 *
 * Every method here is READ-ONLY. There is intentionally no clear/write/test
 * method on the interface.
 */

import type { DtcRecord } from "../domain/dtc.js";
import {
  buildReadinessSnapshot,
  READINESS_MONITOR_NAMES,
  type ReadinessMonitor,
  type ReadinessSnapshot
} from "../domain/readiness.js";
import type { PidSample } from "../domain/pids.js";

/** Info returned when a session is opened. */
export type SessionInfo = {
  adapterId: string;
  connected: boolean;
  /** Reported adapter/protocol identity (e.g. "ELM327 v1.5 (simulated)"). */
  description: string;
  protocol: string;
  /** ISO timestamp the session was opened. */
  connectedAt: string;
};

/** Live status read from the (mock) ECU. */
export type AdapterStatus = {
  /** Malfunction Indicator Lamp ("check engine light") state. */
  milOn: boolean;
  /** Number of confirmed/stored DTCs reported alongside the MIL. */
  dtcCount: number;
  ignition: "on" | "off" | "accessory";
  /** Control-module / battery voltage in volts. */
  voltage: number;
};

/** A freeze-frame snapshot captured when a DTC was set. */
export type FreezeFrame = {
  /** The DTC that triggered the freeze frame, when known. */
  triggerDtc?: string;
  /** Parameter values captured at the moment the code set. */
  samples: PidSample[];
};

/**
 * Read-only OBD adapter. Implementations connect to (or simulate) a vehicle and
 * expose diagnostic reads. There is NO write/clear/active-test method by design.
 */
export interface ObdAdapter {
  readonly id: string;
  connect(): Promise<SessionInfo>;
  readDtcs(): Promise<DtcRecord[]>;
  readReadiness(): Promise<ReadinessSnapshot>;
  readFreezeFrame(): Promise<FreezeFrame>;
  readLivePids(pids?: string[]): Promise<PidSample[]>;
  getStatus(): Promise<AdapterStatus>;
}

const MOCK_SOURCE = "mock-adapter";

/**
 * Canned ELM327-style data source. Returns a small, internally-consistent set
 * of evidence: two DTCs, a readiness snapshot, a freeze frame, and a handful of
 * live PIDs. Values are illustrative only.
 */
export class MockObdAdapter implements ObdAdapter {
  readonly id = "mock";

  async connect(): Promise<SessionInfo> {
    return {
      adapterId: this.id,
      connected: true,
      description: "ELM327 v1.5 (simulated, no hardware)",
      protocol: "ISO 15765-4 (CAN 11/500)",
      connectedAt: new Date().toISOString()
    };
  }

  async readDtcs(): Promise<DtcRecord[]> {
    return [
      { code: "P0301", status: "stored", module: "ECM", source: MOCK_SOURCE },
      { code: "P0420", status: "pending", module: "ECM", source: MOCK_SOURCE }
    ];
  }

  async readReadiness(): Promise<ReadinessSnapshot> {
    const notReady = new Set(["Catalyst", "Evaporative System"]);
    const notSupported = new Set(["Secondary Air", "A/C Refrigerant"]);
    const monitors: ReadinessMonitor[] = READINESS_MONITOR_NAMES.map(name => ({
      name,
      state: notSupported.has(name) ? "not-supported" : notReady.has(name) ? "not-ready" : "ready"
    }));
    return buildReadinessSnapshot(monitors);
  }

  async readFreezeFrame(): Promise<FreezeFrame> {
    return {
      triggerDtc: "P0301",
      samples: [
        { pid: "0C", label: "Engine RPM", value: 845, unit: "rpm", source: MOCK_SOURCE },
        { pid: "0D", label: "Vehicle Speed", value: 0, unit: "km/h", source: MOCK_SOURCE },
        { pid: "05", label: "Engine Coolant Temperature", value: 92, unit: "C", source: MOCK_SOURCE },
        { pid: "04", label: "Calculated Engine Load", value: 27.5, unit: "%", source: MOCK_SOURCE }
      ]
    };
  }

  async readLivePids(pids?: string[]): Promise<PidSample[]> {
    const all: PidSample[] = [
      { pid: "0C", label: "Engine RPM", value: 812, unit: "rpm", source: MOCK_SOURCE },
      { pid: "0D", label: "Vehicle Speed", value: 0, unit: "km/h", source: MOCK_SOURCE },
      { pid: "05", label: "Engine Coolant Temperature", value: 89, unit: "C", source: MOCK_SOURCE },
      { pid: "0F", label: "Intake Air Temperature", value: 31, unit: "C", source: MOCK_SOURCE },
      { pid: "11", label: "Throttle Position", value: 14.1, unit: "%", source: MOCK_SOURCE },
      { pid: "42", label: "Control Module Voltage", value: 14.2, unit: "V", source: MOCK_SOURCE }
    ];
    if (!pids || pids.length === 0) return all;
    const wanted = new Set(pids.map(p => p.trim().toUpperCase().replace(/^0X/, "").padStart(2, "0")));
    return all.filter(s => s.pid !== undefined && wanted.has(s.pid));
  }

  async getStatus(): Promise<AdapterStatus> {
    return { milOn: true, dtcCount: 1, ignition: "on", voltage: 14.2 };
  }
}

/** A described adapter that listAdapters() can advertise. */
export type AdapterDescriptor = {
  id: string;
  kind: "mock" | "serial";
  available: boolean;
  description: string;
};

/**
 * List adapters this server can use. Only the mock adapter is available in v1.
 * Live serial/Bluetooth hardware is intentionally NOT implemented (it would
 * require a forbidden native module); it is advertised as unavailable so the
 * boundary is explicit to callers.
 */
export function listAdapters(): AdapterDescriptor[] {
  return [
    {
      id: "mock",
      kind: "mock",
      available: true,
      description: "Simulated ELM327 adapter with canned diagnostic data. No hardware required."
    },
    {
      id: "serial",
      kind: "serial",
      available: false,
      description:
        "Live serial / Bluetooth ELM327 access is NOT implemented in v1 (requires a native " +
        "serial module this server does not bundle). Use the mock adapter or ingest a scan log."
    }
  ];
}

/** Resolve an adapter by id. Only the mock adapter is constructable in v1. */
export function getAdapter(id: string): ObdAdapter | undefined {
  if (id === "mock") return new MockObdAdapter();
  return undefined;
}
