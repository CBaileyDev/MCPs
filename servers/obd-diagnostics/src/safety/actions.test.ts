import { describe, expect, it } from "vitest";
import { assertReadOnly, isForbiddenAction, FORBIDDEN_ACTIONS } from "./actions.js";

describe("isForbiddenAction", () => {
  it("returns true for every explicitly-listed forbidden action", () => {
    for (const action of FORBIDDEN_ACTIONS) {
      expect(isForbiddenAction(action)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isForbiddenAction("CLEAR_DTCS")).toBe(true);
    expect(isForbiddenAction("Clear_DTCs")).toBe(true);
    expect(isForbiddenAction("ECU_WRITE")).toBe(true);
  });

  it("trims whitespace before checking", () => {
    expect(isForbiddenAction("  clear_dtcs  ")).toBe(true);
  });

  it("returns false for read-only actions", () => {
    expect(isForbiddenAction("read_dtcs")).toBe(false);
    expect(isForbiddenAction("get_status")).toBe(false);
    expect(isForbiddenAction("read_live_pids")).toBe(false);
    expect(isForbiddenAction("ingest_scan_log")).toBe(false);
  });
});

describe("assertReadOnly", () => {
  it("throws for 'clear_dtcs'", () => {
    expect(() => assertReadOnly("clear_dtcs")).toThrow();
  });

  it("throws for 'ecu_write'", () => {
    expect(() => assertReadOnly("ecu_write")).toThrow();
  });

  it("throws for 'active_test'", () => {
    expect(() => assertReadOnly("active_test")).toThrow();
  });

  it("throws for 'reset_mil'", () => {
    expect(() => assertReadOnly("reset_mil")).toThrow();
  });

  it("throws for 'key_coding'", () => {
    expect(() => assertReadOnly("key_coding")).toThrow();
  });

  it("includes a descriptive message on the thrown error", () => {
    expect(() => assertReadOnly("clear_dtcs")).toThrowError(/read-only/i);
  });

  it("does NOT throw for a read action", () => {
    expect(() => assertReadOnly("read_dtcs")).not.toThrow();
    expect(() => assertReadOnly("get_status")).not.toThrow();
    expect(() => assertReadOnly("ingest_scan_log")).not.toThrow();
  });

  it("returns void (undefined) for allowed actions", () => {
    expect(assertReadOnly("read_dtcs")).toBeUndefined();
  });
});
