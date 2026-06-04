import { describe, expect, it } from "vitest";
import { convertWheelOffset, wheelFitmentChange, type OffsetConversion } from "./wheels.js";

function asResult(r: ReturnType<typeof convertWheelOffset>): OffsetConversion {
  if ("error" in r) throw new Error(`unexpected error: ${r.error}`);
  return r;
}

describe("convertWheelOffset", () => {
  it("offset → backspacing with the default 0.5\" lip (overall width = width + 1\")", () => {
    const r = asResult(convertWheelOffset(9, 25, undefined, 0.5));
    expect(r.centerlineIn).toBeCloseTo(5.0, 6); // 9/2 + 0.5
    expect(r.backspacingIn).toBeCloseTo(5.98425, 4); // 5.0 + 25/25.4
  });

  it("round-trips backspacing → offset", () => {
    const r = asResult(convertWheelOffset(9, undefined, 5.98425, 0.5));
    expect(r.offsetMm).toBeCloseTo(25, 3);
  });

  it("zero offset gives backspacing equal to the centerline", () => {
    const r = asResult(convertWheelOffset(8, 0, undefined, 0.5));
    expect(r.centerlineIn).toBeCloseTo(4.5, 6);
    expect(r.backspacingIn).toBeCloseTo(4.5, 6);
  });

  it("lipAllowanceIn = 0 uses the bare width/2 + offset rule", () => {
    const r = asResult(convertWheelOffset(9, 25, undefined, 0));
    expect(r.centerlineIn).toBeCloseTo(4.5, 6);
    expect(r.backspacingIn).toBeCloseTo(5.48425, 4); // 4.5 + 25/25.4
  });

  it("rejects bad input and the not-exactly-one rule", () => {
    expect("error" in convertWheelOffset(0, 25, undefined, 0.5)).toBe(true);
    expect("error" in convertWheelOffset(9, 25, 6, 0.5)).toBe(true); // both
    expect("error" in convertWheelOffset(9, undefined, undefined, 0.5)).toBe(true); // neither
  });
});

describe("wheelFitmentChange", () => {
  it("wider + lower offset pushes the wheel out (more poke), inner clearance ~unchanged", () => {
    const r = wheelFitmentChange(8, 35, 9, 20);
    expect(r.pokeChangeMm).toBeCloseTo(27.7, 4); // 12.7 - (-15)
    expect(r.innerClearanceChangeMm).toBeCloseTo(2.3, 4); // -(12.7 + (-15))
  });

  it("lowering offset on the same width shifts the whole wheel out equally", () => {
    const r = wheelFitmentChange(9, 45, 9, 20);
    expect(r.pokeChangeMm).toBeCloseTo(25, 6); // more poke
    expect(r.innerClearanceChangeMm).toBeCloseTo(25, 6); // and more inner clearance
  });

  it("adding width at the same offset pokes out and reduces inner clearance equally", () => {
    const r = wheelFitmentChange(8, 30, 10, 30);
    expect(r.pokeChangeMm).toBeCloseTo(25.4, 6); // +2" width → 1" each side
    expect(r.innerClearanceChangeMm).toBeCloseTo(-25.4, 6);
  });

  it("is anti-symmetric: reversing old/new negates both deltas", () => {
    const fwd = wheelFitmentChange(8, 35, 9, 20);
    const rev = wheelFitmentChange(9, 20, 8, 35);
    expect(rev.pokeChangeMm).toBeCloseTo(-fwd.pokeChangeMm, 6);
    expect(rev.innerClearanceChangeMm).toBeCloseTo(-fwd.innerClearanceChangeMm, 6);
  });
});
