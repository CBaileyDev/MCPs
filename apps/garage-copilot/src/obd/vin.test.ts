import { describe, it, expect } from "vitest";
import { decodeVinResponse, isValidVin } from "./vin.js";
import { Elm327Client } from "./elm327.js";
import { ReplayTransport } from "./replay-transport.js";
import { DEMO_VEHICLE } from "./recordings.js";

const VIN = "1HGBH41JXMN109186";

describe("decodeVinResponse", () => {
  it("decodes a single-line 49 02 response", () => {
    expect(decodeVinResponse(["49 02 01 31 48 47 42 48 34 31 4A 58 4D 4E 31 30 39 31 38 36"])).toBe(VIN);
  });

  it("decodes a multi-frame response with ISO-TP indices and 0x00 padding", () => {
    const lines = [
      "014",
      "0: 49 02 01 00 00 00 31",
      "1: 48 47 42 48 34 31 4A 58",
      "2: 4D 4E 31 30 39 31 38 36"
    ];
    expect(decodeVinResponse(lines)).toBe(VIN);
  });

  it("returns undefined when no VIN frame is present", () => {
    expect(decodeVinResponse(["NO DATA"])).toBeUndefined();
    expect(decodeVinResponse(["41 0C 1A F8"])).toBeUndefined();
  });
});

describe("isValidVin", () => {
  it("accepts a valid 17-char VIN and rejects malformed ones", () => {
    expect(isValidVin(VIN)).toBe(true);
    expect(isValidVin("1HGBH41JXMN10918")).toBe(false); // 16 chars
    expect(isValidVin("1HGBH41JXMN1091OO")).toBe(false); // contains O
  });
});

describe("Elm327Client.readVin", () => {
  it("reads the VIN from the demo vehicle", async () => {
    const client = new Elm327Client(new ReplayTransport(DEMO_VEHICLE));
    expect(await client.readVin()).toBe(VIN);
  });
});
