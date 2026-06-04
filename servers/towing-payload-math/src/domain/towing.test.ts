import { describe, it, expect } from "vitest";
import {
  calcTongueWeight,
  calcPayloadCheck,
  calcTowingHeadroom,
  calcTowSetupCheck
} from "./towing.js";

// ─── calcTongueWeight — pinned values ─────────────────────────────────────────

describe("calcTongueWeight — pinned: trailerWeightLb 5000, tonguePercent 12", () => {
  it("derives tongueWeightLb = 600", () => {
    const r = calcTongueWeight(5000, undefined, 12, "lb");
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.tongueWeightLb).toBeCloseTo(600, 6);
    }
  });

  it("classifies as 'in range'", () => {
    const r = calcTongueWeight(5000, undefined, 12, "lb");
    if (!("error" in r)) {
      expect(r.classification).toBe("in range");
    }
  });
});

describe("calcTongueWeight — pinned: trailerWeightLb 5000, tongueWeightLb 600", () => {
  it("derives tonguePercent = 12.0", () => {
    const r = calcTongueWeight(5000, 600, undefined, "lb");
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.tonguePercent).toBeCloseTo(12.0, 6);
    }
  });

  it("classifies as 'in range'", () => {
    const r = calcTongueWeight(5000, 600, undefined, "lb");
    if (!("error" in r)) {
      expect(r.classification).toBe("in range");
    }
  });
});

describe("calcTongueWeight — pinned: trailerWeightLb 5000, tonguePercent 8", () => {
  it("derives tongueWeightLb = 400", () => {
    const r = calcTongueWeight(5000, undefined, 8, "lb");
    if (!("error" in r)) {
      expect(r.tongueWeightLb).toBeCloseTo(400, 6);
    }
  });

  it("classifies as 'too light — trailer sway risk'", () => {
    const r = calcTongueWeight(5000, undefined, 8, "lb");
    if (!("error" in r)) {
      expect(r.classification).toBe("too light — trailer sway risk");
    }
  });
});

// ─── calcTongueWeight — heavy classification ──────────────────────────────────

describe("calcTongueWeight — heavy classification (tonguePercent > 15)", () => {
  it("tonguePercent 20 → classifies as heavy", () => {
    const r = calcTongueWeight(5000, undefined, 20, "lb");
    if (!("error" in r)) {
      expect(r.classification).toMatch(/heavy/);
    }
  });
});

// ─── calcTongueWeight — boundary: exactly 10 and 15 are in range ─────────────

describe("calcTongueWeight — boundary values inclusive", () => {
  it("tonguePercent 10 is in range", () => {
    const r = calcTongueWeight(5000, undefined, 10, "lb");
    if (!("error" in r)) {
      expect(r.classification).toBe("in range");
    }
  });

  it("tonguePercent 15 is in range", () => {
    const r = calcTongueWeight(5000, undefined, 15, "lb");
    if (!("error" in r)) {
      expect(r.classification).toBe("in range");
    }
  });

  it("tonguePercent 9.99 is too light", () => {
    const r = calcTongueWeight(5000, undefined, 9.99, "lb");
    if (!("error" in r)) {
      expect(r.classification).toBe("too light — trailer sway risk");
    }
  });

  it("tonguePercent 15.01 is heavy", () => {
    const r = calcTongueWeight(5000, undefined, 15.01, "lb");
    if (!("error" in r)) {
      expect(r.classification).toMatch(/heavy/);
    }
  });
});

// ─── calcTongueWeight — round-trip ────────────────────────────────────────────

describe("calcTongueWeight — round-trip inverse", () => {
  it("percent→weight then weight→percent recovers original percent", () => {
    const r1 = calcTongueWeight(5000, undefined, 12, "lb");
    if (!("error" in r1)) {
      const derivedWeight = r1.tongueWeightLb;
      const r2 = calcTongueWeight(5000, derivedWeight, undefined, "lb");
      if (!("error" in r2)) {
        expect(r2.tonguePercent).toBeCloseTo(12, 8);
      }
    }
  });

  it("weight→percent then percent→weight recovers original weight", () => {
    const r1 = calcTongueWeight(5000, 750, undefined, "lb");
    if (!("error" in r1)) {
      const derivedPct = r1.tonguePercent;
      const r2 = calcTongueWeight(5000, undefined, derivedPct, "lb");
      if (!("error" in r2)) {
        expect(r2.tongueWeightLb).toBeCloseTo(750, 8);
      }
    }
  });
});

// ─── calcTongueWeight — validation / error paths ─────────────────────────────

describe("calcTongueWeight — neither input → error", () => {
  it("returns error naming the rule", () => {
    const r = calcTongueWeight(5000, undefined, undefined, "lb");
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toMatch(/neither/i);
    }
  });
});

describe("calcTongueWeight — both inputs → error", () => {
  it("returns error when both tongueWeightLb and tonguePercent provided", () => {
    const r = calcTongueWeight(5000, 600, 12, "lb");
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toMatch(/both/i);
    }
  });
});

describe("calcTongueWeight — non-positive trailerWeightLb → error", () => {
  it("trailerWeightLb 0 → error", () => {
    const r = calcTongueWeight(0, undefined, 12, "lb");
    expect("error" in r).toBe(true);
  });

  it("trailerWeightLb -100 → error", () => {
    const r = calcTongueWeight(-100, undefined, 12, "lb");
    expect("error" in r).toBe(true);
  });
});

describe("calcTongueWeight — tonguePercent out of (0,100) → error", () => {
  it("tonguePercent 0 → error", () => {
    const r = calcTongueWeight(5000, undefined, 0, "lb");
    expect("error" in r).toBe(true);
  });

  it("tonguePercent 100 → error", () => {
    const r = calcTongueWeight(5000, undefined, 100, "lb");
    expect("error" in r).toBe(true);
  });

  it("tonguePercent -5 → error", () => {
    const r = calcTongueWeight(5000, undefined, -5, "lb");
    expect("error" in r).toBe(true);
  });
});

// ─── calcTongueWeight — result shape ─────────────────────────────────────────

describe("calcTongueWeight — result fields", () => {
  it("includes guidelineNote and unit", () => {
    const r = calcTongueWeight(5000, undefined, 12, "lb");
    if (!("error" in r)) {
      expect(typeof r.guidelineNote).toBe("string");
      expect(r.guidelineNote.length).toBeGreaterThan(0);
      expect(r.unit).toBe("lb");
    }
  });
});

// ─── calcPayloadCheck — pinned values ─────────────────────────────────────────

describe("calcPayloadCheck — pinned: capacity 1500, pax+cargo 800, tongue 600 → used 1400, remaining 100, over false", () => {
  it("usedPayloadLb = 1400", () => {
    const r = calcPayloadCheck(1500, 800, 600, 0, "lb");
    expect(r.usedPayloadLb).toBe(1400);
  });

  it("remainingPayloadLb = 100", () => {
    const r = calcPayloadCheck(1500, 800, 600, 0, "lb");
    expect(r.remainingPayloadLb).toBe(100);
  });

  it("over = false", () => {
    const r = calcPayloadCheck(1500, 800, 600, 0, "lb");
    expect(r.over).toBe(false);
  });
});

describe("calcPayloadCheck — pinned: capacity 1500, pax+cargo 1000, tongue 600 → used 1600, remaining -100, over true", () => {
  it("usedPayloadLb = 1600", () => {
    const r = calcPayloadCheck(1500, 1000, 600, 0, "lb");
    expect(r.usedPayloadLb).toBe(1600);
  });

  it("remainingPayloadLb = -100", () => {
    const r = calcPayloadCheck(1500, 1000, 600, 0, "lb");
    expect(r.remainingPayloadLb).toBe(-100);
  });

  it("over = true", () => {
    const r = calcPayloadCheck(1500, 1000, 600, 0, "lb");
    expect(r.over).toBe(true);
  });
});

// ─── calcPayloadCheck — arithmetic identity (round-trip) ─────────────────────

describe("calcPayloadCheck — arithmetic identity", () => {
  it("usedPayloadLb + remainingPayloadLb === payloadCapacityLb", () => {
    const capacity = 2000;
    const r = calcPayloadCheck(capacity, 700, 400, 50, "lb");
    expect(r.usedPayloadLb + r.remainingPayloadLb).toBe(capacity);
  });

  it("breakdown components sum to usedPayloadLb", () => {
    const r = calcPayloadCheck(2000, 700, 400, 50, "lb");
    const sum =
      r.breakdown.passengersAndCargoLb +
      r.breakdown.tongueWeightLb +
      r.breakdown.otherHitchLoadLb;
    expect(sum).toBe(r.usedPayloadLb);
  });
});

// ─── calcPayloadCheck — note present ─────────────────────────────────────────

describe("calcPayloadCheck — result fields", () => {
  it("includes note about tongue weight counting against payload", () => {
    const r = calcPayloadCheck(1500, 800, 600, 0, "lb");
    expect(typeof r.note).toBe("string");
    expect(r.note).toMatch(/tongue/i);
    expect(r.unit).toBe("lb");
  });
});

// ─── calcTowingHeadroom — pinned values ───────────────────────────────────────

describe("calcTowingHeadroom — pinned: gcwr 15000, loadedTruck 7000, trailer 5000", () => {
  it("combinedWeightLb = 12000", () => {
    const r = calcTowingHeadroom(15000, 7000, 5000, "lb");
    expect(r.combinedWeightLb).toBe(12000);
  });

  it("remainingWithinGcwrLb = 3000", () => {
    const r = calcTowingHeadroom(15000, 7000, 5000, "lb");
    expect(r.remainingWithinGcwrLb).toBe(3000);
  });

  it("maxTrailerAtThisLoadLb = 8000", () => {
    const r = calcTowingHeadroom(15000, 7000, 5000, "lb");
    expect(r.maxTrailerAtThisLoadLb).toBe(8000);
  });

  it("over = false", () => {
    const r = calcTowingHeadroom(15000, 7000, 5000, "lb");
    expect(r.over).toBe(false);
  });
});

// ─── calcTowingHeadroom — over GCWR ───────────────────────────────────────────

describe("calcTowingHeadroom — over GCWR", () => {
  it("over = true when combinedWeight > gcwr", () => {
    const r = calcTowingHeadroom(10000, 7000, 5000, "lb");
    expect(r.over).toBe(true);
    expect(r.remainingWithinGcwrLb).toBe(-2000);
  });
});

// ─── calcTowingHeadroom — arithmetic identity ─────────────────────────────────

describe("calcTowingHeadroom — arithmetic identity", () => {
  it("loadedTruckWeight + trailerWeight === combinedWeightLb", () => {
    const r = calcTowingHeadroom(15000, 7000, 5000, "lb");
    expect(r.combinedWeightLb).toBe(7000 + 5000);
  });

  it("gcwr - loadedTruckWeight === maxTrailerAtThisLoadLb", () => {
    const r = calcTowingHeadroom(15000, 7000, 5000, "lb");
    expect(r.maxTrailerAtThisLoadLb).toBe(15000 - 7000);
  });

  it("gcwr - combinedWeight === remainingWithinGcwrLb", () => {
    const r = calcTowingHeadroom(15000, 7000, 5000, "lb");
    expect(r.remainingWithinGcwrLb).toBe(15000 - 12000);
  });
});

// ─── calcTowingHeadroom — note present ────────────────────────────────────────

describe("calcTowingHeadroom — result fields", () => {
  it("includes note about GCWR and loaded truck weight", () => {
    const r = calcTowingHeadroom(15000, 7000, 5000, "lb");
    expect(typeof r.note).toBe("string");
    expect(r.note).toMatch(/GCWR/);
    expect(r.unit).toBe("lb");
  });
});

// ─── calcTowSetupCheck — pinned values ────────────────────────────────────────

describe("calcTowSetupCheck — pinned: gvwr 7500, curb 5500, gcwr 15000, pax+cargo 800, trailer 5000, tongue 600", () => {
  let result: ReturnType<typeof calcTowSetupCheck>;

  // Set up result once for all assertions
  const getResult = () =>
    calcTowSetupCheck(7500, 5500, 15000, 800, 5000, 600, "lb");

  it("payloadCapacityLb = 2000", () => {
    expect(getResult().payloadCapacityLb).toBe(2000);
  });

  it("usedPayloadLb = 1400", () => {
    expect(getResult().usedPayloadLb).toBe(1400);
  });

  it("loadedTruckWeightLb = 6900", () => {
    expect(getResult().loadedTruckWeightLb).toBe(6900);
  });

  it("remainingPayloadLb = 600, payloadOk = true", () => {
    const r = getResult();
    expect(r.remainingPayloadLb).toBe(600);
    expect(r.payloadOk).toBe(true);
  });

  it("combinedWeightLb = 11900", () => {
    expect(getResult().combinedWeightLb).toBe(11900);
  });

  it("remainingWithinGcwrLb = 3100, gcwrOk = true", () => {
    const r = getResult();
    expect(r.remainingWithinGcwrLb).toBe(3100);
    expect(r.gcwrOk).toBe(true);
  });

  it("tonguePercent = 12.0, tongueOk = true", () => {
    const r = getResult();
    expect(r.tonguePercent).toBeCloseTo(12.0, 6);
    expect(r.tongueOk).toBe(true);
  });

  it("overall = true", () => {
    expect(getResult().overall).toBe(true);
  });
});

// ─── calcTowSetupCheck — failing checks → bindingConstraint ──────────────────

describe("calcTowSetupCheck — payload exceeded", () => {
  it("payloadOk = false, bindingConstraint includes 'payload/GVWR'", () => {
    // Make payload fail: payloadCapacity = 500, usedPayload = 1400
    const r = calcTowSetupCheck(6000, 5500, 15000, 800, 5000, 600, "lb");
    expect(r.payloadOk).toBe(false);
    expect(r.bindingConstraint).toMatch(/payload/i);
    expect(r.overall).toBe(false);
  });
});

describe("calcTowSetupCheck — GCWR exceeded", () => {
  it("gcwrOk = false, bindingConstraint includes 'GCWR'", () => {
    // gcwr very tight: 8000
    const r = calcTowSetupCheck(7500, 5500, 8000, 800, 5000, 600, "lb");
    expect(r.gcwrOk).toBe(false);
    expect(r.bindingConstraint).toMatch(/GCWR/i);
    expect(r.overall).toBe(false);
  });
});

describe("calcTowSetupCheck — tongue out of range", () => {
  it("tongueOk = false when tonguePercent < 10", () => {
    // tongue 200 on trailer 5000 = 4%
    const r = calcTowSetupCheck(7500, 5500, 15000, 800, 5000, 200, "lb");
    expect(r.tongueOk).toBe(false);
    expect(r.overall).toBe(false);
    expect(r.bindingConstraint).toMatch(/tongue/i);
  });
});

// ─── calcTowSetupCheck — arithmetic identities ────────────────────────────────

describe("calcTowSetupCheck — arithmetic identities", () => {
  it("payloadCapacity = gvwr - curbWeight", () => {
    const r = calcTowSetupCheck(7500, 5500, 15000, 800, 5000, 600, "lb");
    expect(r.payloadCapacityLb).toBe(7500 - 5500);
  });

  it("usedPayload = passengersAndCargo + tongueWeight", () => {
    const r = calcTowSetupCheck(7500, 5500, 15000, 800, 5000, 600, "lb");
    expect(r.usedPayloadLb).toBe(800 + 600);
  });

  it("loadedTruckWeight = curbWeight + usedPayload", () => {
    const r = calcTowSetupCheck(7500, 5500, 15000, 800, 5000, 600, "lb");
    expect(r.loadedTruckWeightLb).toBe(5500 + 1400);
  });

  it("combinedWeight = loadedTruckWeight + trailerWeight", () => {
    const r = calcTowSetupCheck(7500, 5500, 15000, 800, 5000, 600, "lb");
    expect(r.combinedWeightLb).toBe(r.loadedTruckWeightLb + 5000);
  });
});
