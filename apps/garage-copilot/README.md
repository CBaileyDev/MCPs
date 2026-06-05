# Garage Copilot

The piece that connects the **brain to the car**. The MCP servers in this repo
are a knowledge-and-reasoning layer; Garage Copilot is the application that talks
to a real OBD-II adapter, turns what the car reports into structured evidence,
and wires every server into one Claude session so the model can reason across
all of them.

It does three things — **diagnose**, **monitor**, and **tune-advise** — and it
runs fully offline (no hardware, no API key) via a built-in replay adapter, so
you can try the whole flow right now.

> **Read-only by design.** Garage Copilot only issues OBD *read* services. It
> never clears codes, writes to an ECU, or runs active tests. The "tune" feature
> is a planning **advisor** (math that validates a proposed change) — it does not
> flash anything. See [Safety & legal](#safety--legal).

## What's inside

| Layer | Module | What it is |
| --- | --- | --- |
| **OBD bridge** | `src/obd/elm327.ts` | A real ELM327 AT-command + OBD protocol driver, written against a transport interface so it's 100% testable without hardware. |
| | `src/obd/pid-formulas.ts` | Standard SAE J1979 Mode-01 PID decode formulas (RPM, coolant, fuel trims, …). |
| | `src/obd/dtc-decode.ts` | DTC byte → code decode (P0301, …) and Mode-01 PID-01 monitor/readiness decode. |
| | `src/obd/vin.ts` | Decode the VIN from a Mode-09 PID-02 response (tolerant of multi-frame ISO-TP). |
| | `src/obd/serial-transport.ts` | Live USB/Bluetooth transport via `serialport` (lazy-loaded; install it only when you want real hardware). |
| | `src/obd/replay-transport.ts` | Offline transport that replays a canned vehicle — powers `--demo` and the tests. |
| | `src/obd/simulator.ts` | A `SimulatedObdReader` with time-varying idle data (RPM wander, coolant warm-up) for demos and dev. |
| **Diagnose** | `src/diagnose/session.ts` | One read-only pass → a `DiagnosticSnapshot` (MIL, DTCs, readiness, live data). |
| | `src/diagnose/report.ts` | Snapshot → a structured, caveated report with structural DTC decode. |
| **Monitor** | `src/monitor/recorder.ts` | Sample PIDs over several rounds into a time series (injected clock — deterministic). |
| | `src/monitor/trends.ts` | Per-parameter stats + conservative flags (fuel-trim drift, overheat, weak charge). |
| **Tune-advise** | `src/tune/advisor.ts` | Read-side validation math: final-drive RPM shift, injector sizing, electrical load budget. |
| **Agent wiring** | `src/agent/mcp-config.ts` | Generates the combined MCP config that wires all repo servers into Claude. |
| | `src/agent/playbook.ts` | The diagnostic playbook (system prompt) for Claude to chain the servers. |

## Quick start

```bash
cd apps/garage-copilot
npm install
npm run build

# Offline demo — replays a canned vehicle (MIL on, P0301 + P0420):
node dist/cli.js diagnose --vehicle "2014 Subaru Forester"

# Real hardware — plug in an ELM327 dongle and install the serial driver:
npm install serialport
node dist/cli.js diagnose --port /dev/ttyUSB0          # macOS: /dev/tty.usbserial-…  Windows: COM3
```

During development you can skip the build with `npm run dev -- diagnose`.

## CLI

```text
garage-copilot diagnose    [--port PATH | --demo] [--baud N] [--vehicle "label"]
garage-copilot monitor     [--port PATH | --demo] [--rounds N] [--interval MS] [--pids 0C,05,...]
garage-copilot advise      final-drive --speed --tire --gear --from --to
                           injectors   --hp --cylinders [--bsfc --duty --density --injector]
                           load        --voltage --existing --watts --alt
garage-copilot mcp-config  [--root /abs/path/to/MCPs]
garage-copilot playbook    [--vehicle "label"]
```

With no `--port`, `diagnose`/`monitor` use the offline demo adapter.

## Using it with Claude (the "+ Claude" part)

Garage Copilot produces the *evidence*; Claude does the *reasoning*, using this
repo's servers. Two pieces make that work:

1. **`mcp-config`** generates the combined MCP-client config for every server:

   ```bash
   node dist/cli.js mcp-config --root /ABS/PATH/TO/MCPs > ~/garage-mcp.json
   ```

   Point Claude Desktop/Code at those servers (see
   [`docs/USING-WITH-CLIENTS.md`](../../docs/USING-WITH-CLIENTS.md)). First build
   the servers you want with `npm install && npm run build` in each.

2. **`playbook`** prints the system prompt that tells Claude how to chain the
   servers around a snapshot — identify the vehicle (vpic), check recalls
   (repair-info), reason about live data (engine-build-math / automotive-
   electrical), find parts (part-interchange), and log it (garage-memory):

   ```bash
   node dist/cli.js playbook --vehicle "2014 Subaru Forester"
   ```

   A typical loop: run `diagnose`, paste the report into a Claude session
   primed with the playbook and wired to the servers, and let it work the
   evidence into a ranked, confirm-the-cheapest-test-first action plan.

The same building blocks are exported from `src/index.ts`, so a host built on the
[Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk) can embed the driver
and feed snapshots to the model directly.

## How the offline demo stays honest

`--demo` doesn't fake the output — it replays canned **ELM327 byte strings**
(`src/obd/recordings.ts`) through the *real* driver and decoders. The hex is
hand-built to decode to the stated values (e.g. `41 0C 0C B0` → 812 rpm), so the
demo exercises the same code path a real dongle would.

## Safety & legal

- **Read-only.** No clear-codes / ECU-write / active-test paths exist anywhere in
  the driver or its interface.
- **Evidence, not diagnosis.** Reports and trend flags are conservative and
  caveated; manufacturer-specific DTC meanings are never invented.
- **"Tune" = advice, not flashing.** The advisor validates the *consequence* of a
  change (RPM shift, injector headroom, alternator load). Actually flashing an
  ECU is done with a proper licensed tool — and modifying emissions-related
  calibration on a road vehicle is regulated (e.g. the U.S. Clean Air Act). Keep
  performance-calibration changes to off-road/track use.
- Clone ELM327 adapters vary; an STN-based dongle (OBDLink SX/MX+) is far more
  reliable if reads are flaky.

## Tests

```bash
npm test        # 58 unit tests, hermetic (no hardware, no network)
npm run typecheck
```

The driver is tested by scripting an in-memory transport; decoders are pinned to
reference byte/value pairs; the advisor and trend analyzers are pure-function
tested. `serialport` is intentionally **not** a dependency, so build and test
need no native modules.
