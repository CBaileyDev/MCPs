import { describe, expect, it } from "vitest";
import { parseDtc, decodeDtcStructure } from "./dtc.js";

describe("parseDtc", () => {
  it("returns normalized uppercase for valid codes", () => {
    expect(parseDtc("P0420")).toBe("P0420");
    expect(parseDtc("p0420")).toBe("P0420");
    expect(parseDtc("U0100")).toBe("U0100");
    expect(parseDtc("B1234")).toBe("B1234");
    expect(parseDtc("C0035")).toBe("C0035");
  });

  it("trims whitespace before validating", () => {
    expect(parseDtc("  P0301  ")).toBe("P0301");
  });

  it("returns null for invalid codes", () => {
    expect(parseDtc("X0420")).toBeNull();   // invalid first letter
    expect(parseDtc("P042")).toBeNull();    // too short
    expect(parseDtc("12345")).toBeNull();   // no leading letter
    expect(parseDtc("")).toBeNull();        // empty
    expect(parseDtc("P04200")).toBeNull();  // too long
    expect(parseDtc("P0GGG")).toBeNull();   // non-hex digits after second char
  });

  it("returns null for non-string input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseDtc(null as any)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseDtc(42 as any)).toBeNull();
  });
});

describe("decodeDtcStructure", () => {
  it("maps the first character to the correct system", () => {
    expect(decodeDtcStructure("P0301").system).toBe("powertrain");
    expect(decodeDtcStructure("B1234").system).toBe("body");
    expect(decodeDtcStructure("C0035").system).toBe("chassis");
    expect(decodeDtcStructure("U0100").system).toBe("network");
  });

  it("classifies second-digit '0' as generic and others as manufacturer", () => {
    expect(decodeDtcStructure("P0420").codeType).toBe("generic");
    expect(decodeDtcStructure("P1234").codeType).toBe("manufacturer");
    expect(decodeDtcStructure("P2345").codeType).toBe("manufacturer");
    expect(decodeDtcStructure("P3456").codeType).toBe("manufacturer");
  });

  it("sets subsystem to the third character of the code", () => {
    // P0420: third char is "4"
    expect(decodeDtcStructure("P0420").subsystem).toBe("4");
    // P0301: third char is "3"
    expect(decodeDtcStructure("P0301").subsystem).toBe("3");
    // U0100: third char is "1"
    expect(decodeDtcStructure("U0100").subsystem).toBe("1");
  });

  it("accepts lowercase input (normalizes internally)", () => {
    const result = decodeDtcStructure("p0301");
    expect(result.system).toBe("powertrain");
    expect(result.codeType).toBe("generic");
  });

  it("throws on an invalid code", () => {
    expect(() => decodeDtcStructure("X0420")).toThrow();
    expect(() => decodeDtcStructure("P042")).toThrow();
    expect(() => decodeDtcStructure("")).toThrow();
    expect(() => decodeDtcStructure("12345")).toThrow();
  });
});
