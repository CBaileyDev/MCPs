import { describe, it, expect } from "vitest";
import {
  convertFuelEconomy,
  convertPower,
  convertTorque,
  convertPressure,
  convertVolume,
  convertSocketSize
} from "./convert.js";

// ─── fuel economy ────────────────────────────────────────────────────────────

describe("convertFuelEconomy — pinned reference values", () => {
  it("30 mpg_us → 7.84 l_per_100km", () => {
    const r = convertFuelEconomy(30, "mpg_us");
    expect(parseFloat(r.l_per_100km.toFixed(2))).toBe(7.84);
  });

  it("30 mpg_us → 36.03 mpg_imp", () => {
    const r = convertFuelEconomy(30, "mpg_us");
    expect(parseFloat(r.mpg_imp.toFixed(2))).toBe(36.03);
  });

  it("30 mpg_us → 12.75 km_per_l", () => {
    const r = convertFuelEconomy(30, "mpg_us");
    expect(parseFloat(r.km_per_l.toFixed(2))).toBe(12.75);
  });

  it("8 l_per_100km → 29.40 mpg_us", () => {
    const r = convertFuelEconomy(8, "l_per_100km");
    expect(parseFloat(r.mpg_us.toFixed(2))).toBe(29.40);
  });

  it("50 mpg_imp → 5.65 l_per_100km", () => {
    const r = convertFuelEconomy(50, "mpg_imp");
    expect(parseFloat(r.l_per_100km.toFixed(2))).toBe(5.65);
  });

  it("result includes inverse note", () => {
    const r = convertFuelEconomy(30, "mpg_us");
    expect(r.note).toMatch(/lower/i);
  });
});

describe("convertFuelEconomy — round-trip", () => {
  it("mpg_us → l_per_100km → mpg_us", () => {
    const r1 = convertFuelEconomy(35, "mpg_us");
    const r2 = convertFuelEconomy(r1.l_per_100km, "l_per_100km");
    expect(r2.mpg_us).toBeCloseTo(35, 6);
  });

  it("km_per_l → l_per_100km → km_per_l", () => {
    const r1 = convertFuelEconomy(15, "km_per_l");
    const r2 = convertFuelEconomy(r1.l_per_100km, "l_per_100km");
    expect(r2.km_per_l).toBeCloseTo(15, 6);
  });

  it("mpg_imp → l_per_100km → mpg_imp", () => {
    const r1 = convertFuelEconomy(45, "mpg_imp");
    const r2 = convertFuelEconomy(r1.l_per_100km, "l_per_100km");
    expect(r2.mpg_imp).toBeCloseTo(45, 6);
  });
});

describe("convertFuelEconomy — input validation", () => {
  it("zero value produces Infinity / division by zero guard", () => {
    // Domain layer should not crash; validation belongs to zod layer
    const r = convertFuelEconomy(0, "mpg_us");
    expect(r.l_per_100km).toBe(Infinity);
  });
});

// ─── power ───────────────────────────────────────────────────────────────────

describe("convertPower — pinned reference values", () => {
  it("100 ps → 73.55 kw", () => {
    const r = convertPower(100, "ps");
    expect(parseFloat(r.kw.toFixed(2))).toBe(73.55);
  });

  it("100 ps → 98.63 hp", () => {
    const r = convertPower(100, "ps");
    expect(parseFloat(r.hp.toFixed(2))).toBe(98.63);
  });

  it("200 hp → 149.14 kw", () => {
    const r = convertPower(200, "hp");
    expect(parseFloat(r.kw.toFixed(2))).toBe(149.14);
  });

  it("200 hp → 202.77 ps", () => {
    const r = convertPower(200, "hp");
    expect(parseFloat(r.ps.toFixed(2))).toBe(202.77);
  });

  it("100 kw → 134.10 hp", () => {
    const r = convertPower(100, "kw");
    expect(parseFloat(r.hp.toFixed(2))).toBe(134.10);
  });

  it("100 kw → 135.96 ps", () => {
    const r = convertPower(100, "kw");
    expect(parseFloat(r.ps.toFixed(2))).toBe(135.96);
  });
});

describe("convertPower — round-trip", () => {
  it("ps → watts (kw) → ps", () => {
    const r1 = convertPower(250, "ps");
    const r2 = convertPower(r1.kw, "kw");
    expect(r2.ps).toBeCloseTo(250, 6);
  });

  it("hp → ps → hp", () => {
    const r1 = convertPower(300, "hp");
    const r2 = convertPower(r1.ps, "ps");
    expect(r2.hp).toBeCloseTo(300, 6);
  });
});

// ─── torque ──────────────────────────────────────────────────────────────────

describe("convertTorque — pinned reference values", () => {
  it("100 lb_ft → 135.58 nm", () => {
    const r = convertTorque(100, "lb_ft");
    expect(parseFloat(r.nm.toFixed(2))).toBe(135.58);
  });

  it("100 lb_ft → 13.83 kg_m", () => {
    const r = convertTorque(100, "lb_ft");
    expect(parseFloat(r.kg_m.toFixed(2))).toBe(13.83);
  });

  it("200 nm → 147.51 lb_ft", () => {
    const r = convertTorque(200, "nm");
    expect(parseFloat(r.lb_ft.toFixed(2))).toBe(147.51);
  });

  it("200 nm → 20.39 kg_m", () => {
    const r = convertTorque(200, "nm");
    expect(parseFloat(r.kg_m.toFixed(2))).toBe(20.39);
  });
});

describe("convertTorque — round-trip", () => {
  it("lb_ft → nm → lb_ft", () => {
    const r1 = convertTorque(350, "lb_ft");
    const r2 = convertTorque(r1.nm, "nm");
    expect(r2.lb_ft).toBeCloseTo(350, 6);
  });

  it("kg_m → nm → kg_m", () => {
    const r1 = convertTorque(50, "kg_m");
    const r2 = convertTorque(r1.nm, "nm");
    expect(r2.kg_m).toBeCloseTo(50, 6);
  });
});

// ─── pressure ────────────────────────────────────────────────────────────────

describe("convertPressure — pinned reference values", () => {
  it("32 psi → 2.21 bar", () => {
    const r = convertPressure(32, "psi");
    expect(parseFloat(r.bar.toFixed(2))).toBe(2.21);
  });

  it("32 psi → 220.63 kpa", () => {
    const r = convertPressure(32, "psi");
    expect(parseFloat(r.kpa.toFixed(2))).toBe(220.63);
  });

  it("29.92 inhg → 14.70 psi (standard atmosphere sanity check)", () => {
    const r = convertPressure(29.92, "inhg");
    expect(parseFloat(r.psi.toFixed(2))).toBe(14.70);
  });

  it("29.92 inhg → 101.32 kpa", () => {
    const r = convertPressure(29.92, "inhg");
    expect(parseFloat(r.kpa.toFixed(2))).toBe(101.32);
  });

  it("1 bar → 14.50 psi", () => {
    const r = convertPressure(1, "bar");
    expect(parseFloat(r.psi.toFixed(2))).toBe(14.50);
  });
});

describe("convertPressure — round-trip", () => {
  it("psi → pa (bar) → psi", () => {
    const r1 = convertPressure(35, "psi");
    const r2 = convertPressure(r1.bar, "bar");
    expect(r2.psi).toBeCloseTo(35, 6);
  });

  it("inhg → kpa → inhg", () => {
    const r1 = convertPressure(29.92, "inhg");
    const r2 = convertPressure(r1.kpa, "kpa");
    expect(r2.inhg).toBeCloseTo(29.92, 6);
  });
});

// ─── volume ──────────────────────────────────────────────────────────────────

describe("convertVolume — pinned reference values", () => {
  it("5 us_qt → 4.73 l", () => {
    const r = convertVolume(5, "us_qt");
    expect(parseFloat(r.l.toFixed(2))).toBe(4.73);
  });

  it("1 us_gal → 3.79 l", () => {
    const r = convertVolume(1, "us_gal");
    expect(parseFloat(r.l.toFixed(2))).toBe(3.79);
  });

  it("1 us_gal → 0.83 imp_gal", () => {
    const r = convertVolume(1, "us_gal");
    expect(parseFloat(r.imp_gal.toFixed(2))).toBe(0.83);
  });

  it("10 l → 2.64 us_gal", () => {
    const r = convertVolume(10, "l");
    expect(parseFloat(r.us_gal.toFixed(2))).toBe(2.64);
  });

  it("10 l → 2.20 imp_gal", () => {
    const r = convertVolume(10, "l");
    expect(parseFloat(r.imp_gal.toFixed(2))).toBe(2.20);
  });
});

describe("convertVolume — round-trip", () => {
  it("us_gal → l → us_gal", () => {
    const r1 = convertVolume(5, "us_gal");
    const r2 = convertVolume(r1.l, "l");
    expect(r2.us_gal).toBeCloseTo(5, 6);
  });

  it("imp_gal → l → imp_gal", () => {
    const r1 = convertVolume(5, "imp_gal");
    const r2 = convertVolume(r1.l, "l");
    expect(r2.imp_gal).toBeCloseTo(5, 6);
  });

  it("us_qt → ml → us_qt", () => {
    const r1 = convertVolume(4, "us_qt");
    const r2 = convertVolume(r1.ml, "ml");
    expect(r2.us_qt).toBeCloseTo(4, 6);
  });
});

// ─── socket size ─────────────────────────────────────────────────────────────

describe("convertSocketSize — pinned reference values", () => {
  it('19 mm → nearest 3/4" (19.05 mm), deltaMm 0.05, verdict "interchangeable"', () => {
    const r = convertSocketSize(19, "mm");
    expect(r.nearestLabel).toBe('3/4"');
    expect(r.nearestMm).toBeCloseTo(19.05, 5);
    expect(r.deltaMm).toBe(0.05);
    expect(r.verdict).toBe("interchangeable");
  });

  it('0.75 in → nearest 19 mm, deltaMm 0.05, verdict "interchangeable"', () => {
    const r = convertSocketSize(0.75, "in");
    expect(r.nearestLabel).toBe("19 mm");
    expect(r.nearestMm).toBe(19);
    expect(r.deltaMm).toBe(0.05);
    expect(r.verdict).toBe("interchangeable");
  });

  it('10 mm → nearest 3/8" (9.525 mm), deltaMm 0.475, verdict "do not substitute"', () => {
    const r = convertSocketSize(10, "mm");
    expect(r.nearestLabel).toBe('3/8"');
    expect(r.nearestMm).toBeCloseTo(9.525, 5);
    expect(r.deltaMm).toBe(0.475);
    expect(r.verdict).toBe("do not substitute");
  });

  it('13 mm → nearest 1/2" (12.7 mm), deltaMm 0.30, verdict "usable in a pinch — risk of rounding the fastener"', () => {
    const r = convertSocketSize(13, "mm");
    expect(r.nearestLabel).toBe('1/2"');
    expect(r.nearestMm).toBeCloseTo(12.7, 5);
    expect(r.deltaMm).toBe(0.3);
    expect(r.verdict).toBe("usable in a pinch — risk of rounding the fastener");
  });

  it("19 mm input is correctly stored", () => {
    const r = convertSocketSize(19, "mm");
    expect(r.inputMm).toBe(19);
    expect(r.inputs.value).toBe(19);
    expect(r.inputs.unit).toBe("mm");
  });
});
