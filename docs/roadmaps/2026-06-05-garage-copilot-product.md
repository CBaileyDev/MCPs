# Garage Copilot Product Roadmap

Date: 2026-06-05

## What it is

Garage Copilot turns this repo's MCP servers and OBD logic into a product you can
use on a real car: an engine + CLI ([`apps/garage-copilot`](../../apps/garage-copilot))
and a macOS desktop GUI ([`apps/garage-copilot-desktop`](../../apps/garage-copilot-desktop))
that plug into the OBD-II port to **diagnose, monitor, and tune-advise**. It is
read-only by design and runs fully offline (no hardware, no API key) via a
built-in simulator.

## Design pillars

1. **Read-only, evidence-first.** Never clears codes, writes to an ECU, or runs
   active tests. Everything is framed as evidence to verify; manufacturer-specific
   DTC meanings are never invented. "Tune" is planning math, not a flasher.
2. **One engine, many faces.** All OBD logic — the ELM327 driver, decoders,
   diagnose/monitor/tune — lives in the engine and is reused verbatim by the CLI
   and the GUI. Bugs get fixed once.
3. **No native-module risk.** The GUI talks to the dongle over the Web Serial API
   (through Electron's `select-serial-port`), so there is nothing to rebuild
   against Electron's ABI. The CLI lazy-loads `serialport` only when asked.
4. **Verifiable without a car.** A replay transport drives the real parser with
   canned frames; a simulator produces time-varying data; a headless Electron
   smoke test exercises the GUI. CI is hermetic.

## Current state (done)

- Real ELM327 protocol driver (AT init, OBD modes 01/02/03/07/09, command queue,
  timeouts, bus-error handling), SAE J1979 PID formulas, DTC + readiness decode,
  **VIN** read.
- Diagnose → snapshot → caveated report; Monitor → trend analysis; Tune advisor
  (final-drive / injectors / electrical load).
- Claude wiring: combined MCP-config generator + diagnostic playbook prompt.
- Desktop GUI: Diagnose / Live Monitor (sparklines) / Tune Advisor, VIN, adapter
  log, CSV export, baud selector, app icon, native menu, Demo mode.
- ~70 engine tests + desktop tests + boot smoke; CI jobs for both; validated
  electron-builder packaging.

## Next (proposed, in order)

1. **Real-hardware bring-up pass.** Test against a physical ELM327 (USB + BT),
   tune timeouts for slow protocol negotiation, widen status-token handling, and
   capture a couple of real recordings to add as fixtures.
2. **Freeze-frame read (Mode 02).** Show the conditions captured when a DTC set;
   the riskiest decode, so gate it behind real-hardware testing.
3. **Trip recording + history.** Persist monitor sessions (JSONL) and let the GUI
   reopen and chart past drives; wire into `garage-memory`.
4. **"Explain with Claude" in the GUI.** A one-click hand-off that bundles the
   snapshot + playbook and opens an agent session over the MCP servers.
5. **Distribution.** Code-sign + notarize the macOS build; add auto-update.
6. **VIN → context bridge.** Decode the read VIN via the `vpic` server and seed
   `vehicle-context-fitment` / `garage-memory` automatically.

## Non-goals (for now)

- ECU flashing / write services / active tests (legal + safety; out of scope).
- Emissions-defeat tuning on road vehicles (regulated).
- Bundling proprietary DTC databases (manufacturer-specific meanings stay external).
