#!/usr/bin/env node
/**
 * Garage Copilot CLI.
 *
 * Commands:
 *   diagnose   Run a read-only diagnostic pass and print a report.
 *   monitor    Sample live data over several rounds and print trends.
 *   advise     Read-side tune advisor (final-drive | injectors | load).
 *   mcp-config Print the combined MCP config that wires every repo server into Claude.
 *   playbook   Print the diagnostic playbook (system prompt for the agent).
 *
 * Connection: pass --port /dev/ttyUSB0 (real ELM327) or --demo for the offline
 * replay adapter. With no --port, --demo is assumed so the tool always runs.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Elm327Client } from "./obd/elm327.js";
import { ReplayTransport } from "./obd/replay-transport.js";
import { DEMO_VEHICLE } from "./obd/recordings.js";
import { openSerialTransport } from "./obd/serial-transport.js";
import { SimulatedObdReader } from "./obd/simulator.js";
import type { ObdReader } from "./obd/reader.js";
import { runDiagnosticSession } from "./diagnose/session.js";
import { buildReport } from "./diagnose/report.js";
import { recordSeries } from "./monitor/recorder.js";
import { analyzeTrends } from "./monitor/trends.js";
import {
  assessAddedElectricalLoad,
  assessFinalDriveChange,
  assessInjectorsForTarget,
  type Assessment
} from "./tune/advisor.js";
import { renderMcpConfig } from "./agent/mcp-config.js";
import { buildSystemPrompt } from "./agent/playbook.js";

type Flags = { _: string[]; flags: Record<string, string | boolean> };

function parseArgs(argv: string[]): Flags {
  const out: Flags = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function num(flags: Flags["flags"], key: string): number {
  const raw = flags[key];
  const n = Number(raw);
  if (raw === undefined || raw === true || Number.isNaN(n)) {
    throw new Error(`Missing or invalid numeric flag --${key}`);
  }
  return n;
}

async function makeReader(flags: Flags["flags"]): Promise<{ reader: ObdReader; demo: boolean }> {
  const port = typeof flags.port === "string" ? flags.port : undefined;
  // --sim uses the time-varying simulator (nice for `monitor`); otherwise the
  // replay adapter drives the real ELM327 parser with canned frames.
  if (flags.sim === true) {
    return { reader: new SimulatedObdReader(), demo: true };
  }
  const useDemo = flags.demo === true || port === undefined;
  if (useDemo) {
    return { reader: new Elm327Client(new ReplayTransport(DEMO_VEHICLE)), demo: true };
  }
  const baud = flags.baud !== undefined ? num(flags, "baud") : 38400;
  const transport = await openSerialTransport(port as string, { baudRate: baud });
  return { reader: new Elm327Client(transport), demo: false };
}

function printAssessment(title: string, a: Assessment): void {
  console.log(`# ${title}`);
  console.log(a.ok ? "✓ within limits" : "✗ exceeds limits");
  console.log(a.summary);
  console.log("");
  for (const [k, v] of Object.entries(a.details)) console.log(`  ${k}: ${v}`);
  console.log("");
  for (const n of a.notes) console.log(`- ${n}`);
}

/** Walk up from `start` to find the MCPs repo root (the dir containing servers/). */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "servers")) && existsSync(join(dir, "README.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

async function cmdDiagnose(f: Flags): Promise<void> {
  const { reader, demo } = await makeReader(f.flags);
  try {
    const snapshot = await runDiagnosticSession(reader);
    const label = typeof f.flags.vehicle === "string" ? f.flags.vehicle : undefined;
    const report = buildReport(snapshot, label);
    if (demo) console.log("(offline demo — no adapter connected; pass --port for real hardware)\n");
    console.log(report.text);
  } finally {
    await reader.close();
  }
}

async function cmdMonitor(f: Flags): Promise<void> {
  const { reader, demo } = await makeReader(f.flags);
  try {
    const rounds = f.flags.rounds !== undefined ? num(f.flags, "rounds") : demo ? 5 : 30;
    const intervalMs = f.flags.interval !== undefined ? num(f.flags, "interval") : demo ? 150 : 1000;
    const pids =
      typeof f.flags.pids === "string"
        ? f.flags.pids.split(",").map(p => p.trim()).filter(Boolean)
        : ["0C", "05", "06", "07", "42"];
    await reader.initialize();
    const series = await recordSeries(reader, { pids, rounds, intervalMs });
    const report = analyzeTrends(series);
    if (demo) console.log("(offline demo — no adapter connected; pass --port for real hardware, or --sim for moving data)\n");
    console.log("# Monitor — per-parameter trends");
    for (const s of report.stats) {
      console.log(
        `${s.label} [${s.pid}]: avg ${s.avg}${s.unit ? " " + s.unit : ""} (min ${s.min}, max ${s.max}, slope ${s.slopePerMinute}/min, n=${s.count})`
      );
    }
    console.log("");
    console.log("# Flags");
    if (report.flags.length === 0) console.log("None.");
    for (const flag of report.flags) console.log(`[${flag.severity}] ${flag.parameter}: ${flag.message}`);
    console.log(`\n${report.caveat}`);
  } finally {
    await reader.close();
  }
}

function cmdAdvise(f: Flags): void {
  const sub = f._[1];
  switch (sub) {
    case "final-drive":
      printAssessment(
        "Final-drive change",
        assessFinalDriveChange({
          speedMph: num(f.flags, "speed"),
          tireDiameterIn: num(f.flags, "tire"),
          topGearRatio: num(f.flags, "gear"),
          currentFinalDrive: num(f.flags, "from"),
          newFinalDrive: num(f.flags, "to")
        })
      );
      break;
    case "injectors":
      printAssessment(
        "Injector sizing",
        assessInjectorsForTarget({
          targetHp: num(f.flags, "hp"),
          cylinders: num(f.flags, "cylinders"),
          bsfc: f.flags.bsfc !== undefined ? num(f.flags, "bsfc") : undefined,
          maxDutyCycle: f.flags.duty !== undefined ? num(f.flags, "duty") : undefined,
          fuelDensity: f.flags.density !== undefined ? num(f.flags, "density") : undefined,
          proposedCcMin: f.flags.injector !== undefined ? num(f.flags, "injector") : undefined
        })
      );
      break;
    case "load":
      printAssessment(
        "Added electrical load",
        assessAddedElectricalLoad({
          systemVoltage: num(f.flags, "voltage"),
          existingLoadA: num(f.flags, "existing"),
          addedWatts: num(f.flags, "watts"),
          alternatorRatedA: num(f.flags, "alt")
        })
      );
      break;
    default:
      console.error("Usage: garage-copilot advise <final-drive|injectors|load> [flags]");
      process.exitCode = 1;
  }
}

function cmdMcpConfig(f: Flags): void {
  const root = typeof f.flags.root === "string" ? f.flags.root : findRepoRoot(process.cwd());
  console.log(renderMcpConfig(root));
}

function cmdPlaybook(f: Flags): void {
  const label = typeof f.flags.vehicle === "string" ? f.flags.vehicle : undefined;
  console.log(buildSystemPrompt({ vehicleLabel: label }));
}

function usage(): void {
  console.log(`garage-copilot <command> [flags]

Commands:
  diagnose    [--port PATH | --demo | --sim] [--baud N] [--vehicle "label"]
  monitor     [--port PATH | --demo | --sim] [--rounds N] [--interval MS] [--pids 0C,05,...]
  advise      final-drive --speed --tire --gear --from --to
              injectors   --hp --cylinders [--bsfc --duty --density --injector]
              load        --voltage --existing --watts --alt
  mcp-config  [--root /abs/path/to/MCPs]
  playbook    [--vehicle "label"]

With no --port, diagnose/monitor run against the offline demo adapter.`);
}

async function main(): Promise<void> {
  const f = parseArgs(process.argv.slice(2));
  const command = f._[0];
  try {
    switch (command) {
      case "diagnose":
        await cmdDiagnose(f);
        break;
      case "monitor":
        await cmdMonitor(f);
        break;
      case "advise":
        cmdAdvise(f);
        break;
      case "mcp-config":
        cmdMcpConfig(f);
        break;
      case "playbook":
        cmdPlaybook(f);
        break;
      case undefined:
      case "help":
      case "--help":
        usage();
        break;
      default:
        console.error(`Unknown command: ${command}\n`);
        usage();
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

await main();
