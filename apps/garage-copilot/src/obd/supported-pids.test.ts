import { describe, it, expect } from "vitest";
import { decodeSupportedPids } from "./supported-pids.js";
import { Elm327Client } from "./elm327.js";
import { ReplayTransport } from "./replay-transport.js";

describe("decodeSupportedPids", () => {
  it("maps the MSB of A to the first PID and LSB of D to the last", () => {
    expect(decodeSupportedPids(0x00, [0x80, 0, 0, 0])).toEqual(["01"]);
    expect(decodeSupportedPids(0x00, [0, 0, 0, 0x01])).toEqual(["20"]);
  });
  it("decodes a mixed mask relative to the base PID", () => {
    // B=0x18 -> PIDs 0C, 0D; D=0x01 -> PID 20 (next-range marker).
    expect(decodeSupportedPids(0x00, [0x00, 0x18, 0x00, 0x01])).toEqual(["0C", "0D", "20"]);
    // base 0x20, B bit1 -> PID 2F.
    expect(decodeSupportedPids(0x20, [0x00, 0x02, 0x00, 0x00])).toEqual(["2F"]);
  });
  it("returns nothing for a short frame", () => {
    expect(decodeSupportedPids(0x00, [0x80])).toEqual([]);
  });
});

describe("Elm327Client.readSupportedPids", () => {
  it("walks the bitmask ranges and drops the range markers", async () => {
    const transport = new ReplayTransport({
      "0100": "41 00 00 18 00 01", // 0C, 0D, and 20 (continue)
      "0120": "41 20 00 02 00 00" // 2F, no 40 marker (stop)
    });
    const client = new Elm327Client(transport);
    expect(await client.readSupportedPids()).toEqual(["0C", "0D", "2F"]);
  });

  it("stops at the first range with no data", async () => {
    const transport = new ReplayTransport({ "0100": "41 00 00 18 00 00" }); // no 20 marker
    const client = new Elm327Client(transport);
    expect(await client.readSupportedPids()).toEqual(["0C", "0D"]);
  });
});
