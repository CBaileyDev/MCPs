import { describe, it, expect } from "vitest";
import {
  decodeDtcBytes,
  decodeDtcResponse,
  decodeMonitorStatus,
  decodeTroubleCodes,
  parseHexBytes
} from "./dtc-decode.js";

describe("parseHexBytes", () => {
  it("parses spaced and packed hex", () => {
    expect(parseHexBytes("41 0C 1A F8")).toEqual([0x41, 0x0c, 0x1a, 0xf8]);
    expect(parseHexBytes("410C1AF8")).toEqual([0x41, 0x0c, 0x1a, 0xf8]);
  });
  it("rejects non-hex / odd-length", () => {
    expect(parseHexBytes("NO DATA")).toEqual([]);
    expect(parseHexBytes("41 0")).toEqual([]); // odd nibbles
    expect(parseHexBytes("")).toEqual([]);
  });
});

describe("decodeDtcBytes", () => {
  it("decodes the canonical P0301 / P0420 pairs", () => {
    expect(decodeDtcBytes(0x03, 0x01)).toBe("P0301");
    expect(decodeDtcBytes(0x04, 0x20)).toBe("P0420");
  });
  it("decodes the system letter from the top two bits", () => {
    expect(decodeDtcBytes(0x01, 0x33)).toBe("P0133"); // 00 -> P
    expect(decodeDtcBytes(0x41, 0x00)).toBe("C0100"); // 01 -> C
    expect(decodeDtcBytes(0x81, 0x23)).toBe("B0123"); // 10 -> B
    expect(decodeDtcBytes(0xc1, 0x00)).toBe("U0100"); // 11 -> U
  });
  it("treats the all-zero pair as padding (no code)", () => {
    expect(decodeDtcBytes(0, 0)).toBeNull();
  });
});

describe("decodeTroubleCodes / decodeDtcResponse", () => {
  it("reads pairs and drops padding", () => {
    expect(decodeTroubleCodes([0x03, 0x01, 0x04, 0x20, 0x00, 0x00])).toEqual(["P0301", "P0420"]);
  });
  it("strips the service header and dedupes across lines", () => {
    expect(decodeDtcResponse(["43 03 01 04 20"], 0x43)).toEqual(["P0301", "P0420"]);
    expect(decodeDtcResponse(["43 03 01", "43 03 01"], 0x43)).toEqual(["P0301"]);
  });
  it("skips the CAN count byte so it does not become a phantom code", () => {
    // Without skipCountByte the 0x02 count would mis-pair into garbage.
    expect(decodeDtcResponse(["43 02 03 01 04 20"], 0x43)).toEqual(["P0203", "P0104"]);
    expect(decodeDtcResponse(["43 02 03 01 04 20"], 0x43, { skipCountByte: true })).toEqual(["P0301", "P0420"]);
  });
  it("strips an ISO-TP frame index before decoding", () => {
    expect(decodeDtcResponse(["0: 43 02 03 01 04 20"], 0x43, { skipCountByte: true })).toEqual(["P0301", "P0420"]);
  });
  it("returns empty when the service byte is absent", () => {
    expect(decodeDtcResponse(["NO DATA"], 0x43)).toEqual([]);
  });
});

describe("decodeMonitorStatus", () => {
  it("decodes MIL, count, ignition type, and monitor states", () => {
    // A=0x82 -> MIL on, 2 DTCs. B=0x07 -> spark, continuous supported & complete.
    // C=0x21 -> Catalyst + O2 Sensor supported. D=0x01 -> Catalyst incomplete only.
    const status = decodeMonitorStatus([0x82, 0x07, 0x21, 0x01]);
    expect(status.milOn).toBe(true);
    expect(status.dtcCount).toBe(2);
    expect(status.ignitionType).toBe("spark");

    const byName = Object.fromEntries(status.monitors.map(m => [m.name, m.state]));
    expect(byName["Misfire"]).toBe("ready");
    expect(byName["Fuel System"]).toBe("ready");
    expect(byName["Catalyst"]).toBe("not-ready");
    expect(byName["Oxygen Sensor"]).toBe("ready");
    expect(byName["EGR System"]).toBe("not-supported");
  });

  it("detects compression ignition and MIL off", () => {
    const status = decodeMonitorStatus([0x00, 0x0f, 0x00, 0x00]);
    expect(status.milOn).toBe(false);
    expect(status.dtcCount).toBe(0);
    expect(status.ignitionType).toBe("compression"); // B bit3 set
  });

  it("throws on a short frame", () => {
    expect(() => decodeMonitorStatus([0x82, 0x07])).toThrow(/4 data bytes/);
  });
});
