/**
 * Canned ELM327 conversations for the offline replay adapter.
 *
 * DEMO_VEHICLE is an internally-consistent capture of a spark-ignition car with
 * the MIL on, two stored DTCs (a cylinder-1 misfire P0301 and a catalyst-
 * efficiency P0420), the catalyst monitor not yet ready, and a plausible set of
 * idle live values. The byte strings are hand-built to decode exactly to those
 * values, so the demo exercises the real driver and decoders — not a shortcut.
 *
 * Values are illustrative only.
 */

import type { ReplayScript } from "./replay-transport.js";

export const DEMO_VEHICLE: ReplayScript = {
  // --- Adapter init -----------------------------------------------------
  ATZ: "ELM327 v1.5",
  ATE0: "OK",
  ATL0: "OK",
  ATS0: "OK",
  ATH0: "OK",
  ATSP0: "OK",
  ATDP: "ISO 15765-4 (CAN 11/500)",
  ATRV: "14.2V",
  // Supported PIDs bitmask (forces protocol negotiation on first request).
  "0100": "41 00 BE 3F A8 13",

  // --- Monitor status (Mode 01 PID 01) ----------------------------------
  // A=0x82 -> MIL on, 2 DTCs. B=0x07 -> spark ignition; misfire/fuel/components
  // supported and complete. C=0x21 -> Catalyst + Oxygen Sensor supported.
  // D=0x01 -> Catalyst incomplete (not ready); Oxygen Sensor complete (ready).
  "0101": "41 01 82 07 21 01",

  // --- DTCs --------------------------------------------------------------
  // CAN Mode 03: "43 <count> <dtc pairs>". 02 codes: P0301 (03 01), P0420 (04 20).
  "03": "43 02 03 01 04 20",
  "07": "NO DATA", // no pending codes
  "0A": "NO DATA", // no permanent codes

  // VIN (Mode 09 PID 02): ASCII for "1HGBH41JXMN109186" after the 49 02 01 header.
  "0902": "49 02 01 31 48 47 42 48 34 31 4A 58 4D 4E 31 30 39 31 38 36",

  // --- Live PIDs (idle) --------------------------------------------------
  "010C": "41 0C 0C B0", // RPM   = (256*12+176)/4 = 812 rpm
  "010D": "41 0D 00", // Speed = 0 km/h
  "0105": "41 05 81", // Coolant = 0x81-40 = 89 C
  "010F": "41 0F 47", // IAT = 0x47-40 = 31 C
  "0111": "41 11 24", // Throttle = 0x24*100/255 = 14.12 %
  "0106": "41 06 84", // STFT b1 = (0x84-128)*100/128 = 3.13 %
  "0107": "41 07 89", // LTFT b1 = (0x89-128)*100/128 = 7.03 %
  "0142": "41 42 37 78" // Module voltage = (256*55+120)/1000 = 14.2 V
};

/** PIDs the demo session samples, in display order. */
export const DEMO_LIVE_PIDS = ["0C", "0D", "05", "0F", "11", "06", "07", "42"];
