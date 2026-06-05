/**
 * A real ELM327 protocol driver.
 *
 * This is the live OBD bridge that was missing from the repo: it speaks the
 * ELM327 AT-command + OBD-request protocol over any {@link ObdTransport}. It is
 * written purely against the transport interface, so the entire command/response
 * state machine is unit-testable with an in-memory scripted transport — no
 * hardware, no native modules.
 *
 * READ-ONLY by design: this driver only issues OBD read services (01/02/03/07/
 * 0A) and benign AT configuration commands. It never clears codes, writes to an
 * ECU, or runs active tests.
 */

import type { ObdTransport } from "./transport.js";
import type { ObdIdentity, ObdReader } from "./reader.js";
import { decodePidData, normalizePid, type DecodedPid } from "./pid-formulas.js";
import {
  decodeDtcResponse,
  decodeMonitorStatus,
  parseHexBytes,
  type MonitorStatus
} from "./dtc-decode.js";
import { decodeVinResponse } from "./vin.js";
import { decodeSupportedPids, SUPPORT_RANGE_PIDS } from "./supported-pids.js";

/** Error raised when the adapter reports a protocol/bus failure. */
export class ObdError extends Error {
  constructor(message: string, readonly lines?: string[]) {
    super(message);
    this.name = "ObdError";
  }
}

export type Elm327Options = {
  /** Per-command response timeout in milliseconds (default 5000). */
  timeoutMs?: number;
  /**
   * Called for every completed command with the command sent and the cleaned
   * response lines. Useful for a live "adapter log" when bringing up hardware.
   */
  onTransaction?: (command: string, response: string[]) => void;
};

/** Adapter status strings that are not hex data. */
const STATUS_TOKENS = new Set([
  "OK",
  "NO DATA",
  "STOPPED",
  "SEARCHING...",
  "SEARCHING",
  "UNABLE TO CONNECT",
  "BUS INIT: OK",
  "BUS INIT: ...OK",
  "BUS INIT: ERROR",
  "BUS ERROR",
  "CAN ERROR",
  "DATA ERROR",
  "BUFFER FULL",
  "?"
]);

const ERROR_TOKENS = ["UNABLE TO CONNECT", "BUS INIT: ERROR", "BUS ERROR", "CAN ERROR", "DATA ERROR"];

export class Elm327Client implements ObdReader {
  private readonly timeoutMs: number;
  private readonly onTransaction?: (command: string, response: string[]) => void;
  /** True once init detects a CAN protocol (DTC responses carry a count byte). */
  private canMode = false;
  /** Serializes commands: the OBD link is half-duplex, so overlapping reads
   * (e.g. live polling racing a scan) must not interleave on the wire. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly transport: ObdTransport, options: Elm327Options = {}) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.onTransaction = options.onTransaction;
  }

  /**
   * Write a single command and collect the response up to the ELM327 ">" prompt.
   * Commands are queued so concurrent callers run one-at-a-time in call order.
   * Returns the response split into trimmed, non-empty lines with the prompt and
   * any command echo removed. Rejects if the prompt is not seen within
   * `timeoutMs` (defaults to the instance timeout); pass a larger value for slow
   * operations like protocol negotiation.
   */
  async send(command: string, timeoutMs?: number): Promise<string[]> {
    const run = this.queue.then(() => this.sendNow(command, timeoutMs));
    // Keep the chain alive even if this command rejects.
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async sendNow(command: string, timeoutMs = this.timeoutMs): Promise<string[]> {
    let buffer = "";
    let unsubscribe: (() => void) | undefined;

    const result = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new ObdError(`Timed out waiting for response to "${command}" after ${timeoutMs}ms`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        unsubscribe?.();
      };

      unsubscribe = this.transport.onData(chunk => {
        buffer += chunk;
        if (buffer.includes(">")) {
          cleanup();
          resolve(buffer);
        }
      });

      this.transport.write(`${command}\r`).catch(err => {
        cleanup();
        reject(err instanceof Error ? err : new ObdError(String(err)));
      });
    });

    const lines = result
      .replace(/>/g, "")
      .split(/[\r\n]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      // Drop a leading echo of the command itself (when ATE0 has not taken effect).
      .filter((line, i) => !(i === 0 && line.replace(/\s+/g, "").toUpperCase() === command.replace(/\s+/g, "").toUpperCase()));

    this.onTransaction?.(command, lines);
    return lines;
  }

  async initialize(): Promise<ObdIdentity> {
    // ATZ fully resets; subsequent commands configure a clean, parseable mode.
    const reset = await this.send("ATZ");
    const description = reset.find(l => /ELM/i.test(l)) ?? reset[reset.length - 1] ?? "ELM327 (unknown)";
    await this.send("ATE0"); // echo off
    await this.send("ATL0"); // linefeeds off
    await this.send("ATS0"); // spaces off
    await this.send("ATH0"); // headers off
    await this.send("ATSP0"); // automatic protocol selection
    // The first real request forces protocol negotiation, which can take several
    // seconds on some vehicles ("SEARCHING..."), so give it a generous timeout.
    // (The AT setup commands above use the instance timeout, so a dead adapter
    // still fails fast on ATZ rather than hanging the whole init.)
    await this.send("0100", Math.max(this.timeoutMs, 12_000)).catch(() => undefined);
    let protocol = "unknown";
    try {
      const dp = await this.send("ATDP");
      if (dp.length > 0) protocol = dp.join(" ").trim();
    } catch {
      // Protocol description is best-effort.
    }
    // CAN (ISO 15765-4) DTC responses carry a leading count byte; remember so
    // readDtcMode strips it. Legacy protocols (J1850/ISO 9141/KWP) do not.
    this.canMode = /CAN|15765/i.test(protocol);
    return { description: description.trim(), protocol };
  }

  /** Throw if the response contains a bus/protocol error token. */
  private assertNoBusError(lines: string[], command: string): void {
    const upper = lines.map(l => l.toUpperCase());
    for (const token of ERROR_TOKENS) {
      if (upper.some(l => l.includes(token))) {
        throw new ObdError(`Adapter reported "${token}" for "${command}"`, lines);
      }
    }
  }

  /** True if the response is the "NO DATA" / empty-but-OK case. */
  private isNoData(lines: string[]): boolean {
    return lines.some(l => l.toUpperCase() === "NO DATA") || lines.length === 0;
  }

  /** Hex data lines only (status tokens removed). */
  private hexLines(lines: string[]): string[] {
    return lines.filter(l => !STATUS_TOKENS.has(l.toUpperCase()) && parseHexBytes(l).length > 0);
  }

  async readMonitorStatus(): Promise<MonitorStatus> {
    const lines = await this.send("0101");
    this.assertNoBusError(lines, "0101");
    if (this.isNoData(lines)) {
      throw new ObdError('No monitor status returned (adapter said "NO DATA")', lines);
    }
    const data = this.extractPidData(this.hexLines(lines), 0x41, "01");
    if (!data) throw new ObdError("Could not parse monitor status (41 01) response", lines);
    return decodeMonitorStatus(data);
  }

  async readStoredDtcs(): Promise<string[]> {
    return this.readDtcMode("03", 0x43);
  }

  async readPendingDtcs(): Promise<string[]> {
    return this.readDtcMode("07", 0x47);
  }

  async readPermanentDtcs(): Promise<string[]> {
    return this.readDtcMode("0A", 0x4a);
  }

  private async readDtcMode(command: string, service: number): Promise<string[]> {
    const lines = await this.send(command);
    this.assertNoBusError(lines, command);
    if (this.isNoData(lines)) return [];
    // Pass raw lines so any ISO-TP frame index is preserved for stripping; on CAN
    // skip the leading count byte after the service byte.
    return decodeDtcResponse(lines, service, { skipCountByte: this.canMode });
  }

  async readLivePid(pid: string): Promise<DecodedPid | undefined> {
    const code = normalizePid(pid);
    if (!code) return undefined;
    const lines = await this.send(`01${code}`);
    this.assertNoBusError(lines, `01${code}`);
    if (this.isNoData(lines)) return undefined;
    const data = this.extractPidData(this.hexLines(lines), 0x41, code);
    if (!data) return undefined;
    return decodePidData(code, data);
  }

  async readVoltage(): Promise<number | undefined> {
    try {
      const lines = await this.send("ATRV");
      for (const line of lines) {
        const match = line.match(/(\d+(?:\.\d+)?)\s*V/i);
        if (match) return Number(match[1]);
      }
    } catch {
      // Voltage is best-effort; not all adapters support ATRV.
    }
    return undefined;
  }

  /**
   * Discover which Mode-01 PIDs the ECU supports by walking the 00/20/40/…
   * bitmask PIDs. Returns sorted PID hex codes with the range-marker PIDs
   * removed. Stops at the first unsupported range. Never throws.
   */
  async readSupportedPids(): Promise<string[]> {
    const supported = new Set<string>();
    for (let base = 0x00; base <= 0xc0; base += 0x20) {
      const baseHex = base.toString(16).toUpperCase().padStart(2, "0");
      let data: number[] | undefined;
      try {
        const lines = await this.send(`01${baseHex}`);
        if (this.isNoData(lines)) break;
        data = this.extractPidData(this.hexLines(lines), 0x41, baseHex);
      } catch {
        break;
      }
      if (!data || data.length < 4) break;
      const next = (base + 0x20).toString(16).toUpperCase().padStart(2, "0");
      let nextSupported = false;
      for (const pid of decodeSupportedPids(base, data)) {
        if (pid === next) nextSupported = true;
        supported.add(pid);
      }
      if (!nextSupported) break;
    }
    for (const marker of SUPPORT_RANGE_PIDS) supported.delete(marker);
    return [...supported].sort();
  }

  async readVin(): Promise<string | undefined> {
    try {
      const lines = await this.send("0902");
      this.assertNoBusError(lines, "0902");
      if (this.isNoData(lines)) return undefined;
      // Pass raw lines (not hexLines): VIN frames may carry an ISO-TP index
      // prefix that decodeVinResponse strips itself.
      return decodeVinResponse(lines);
    } catch {
      // VIN (mode 09) is not supported by every ECU; treat as unavailable.
      return undefined;
    }
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  /**
   * From hex response lines, find the first line whose bytes start with the
   * positive-response header [service, pid] and return the data bytes after it.
   * `service` is the response service byte (0x41 for mode 01); `pid` is the
   * 2-char hex PID echoed back. Returns undefined if no matching frame is found.
   */
  private extractPidData(lines: string[], service: number, pid: string): number[] | undefined {
    const pidByte = parseInt(pid, 16);
    for (const line of lines) {
      const bytes = parseHexBytes(line);
      for (let i = 0; i + 1 < bytes.length; i++) {
        if (bytes[i] === service && bytes[i + 1] === pidByte) {
          return bytes.slice(i + 2);
        }
      }
    }
    return undefined;
  }
}
