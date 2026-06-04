import { describe, expect, it } from "vitest";
import { estimateRangeMargin } from "./range.js";

describe("estimateRangeMargin — battery+efficiency path", () => {
  it("computes usable range from batteryKwh × efficiencyMiPerKwh and startSoc", () => {
    // 75 kWh × 4 mi/kWh = 300 mi rated; at 90% SOC = 270 mi available
    const result = estimateRangeMargin({
      tripMiles: 100,
      startSocPercent: 90,
      batteryKwh: 75,
      efficiencyMiPerKwh: 4
    });
    // rated = 300, derated = 300 (0% derate), available = 270, reserve = 30 (10%)
    expect(result.usableRangeMiles).toBe(270);
    // arrivalSoc: (270-100)/300 * 100 = 56.7
    expect(result.arrivalSocPercent).toBe(56.7);
    // margin: 270 - 100 - 30 = 140
    expect(result.marginMiles).toBe(140);
    expect(result.withinReserve).toBe(true);
    expect(result.risk).toBe("ok");
  });

  it("echoes every input into assumptions", () => {
    const result = estimateRangeMargin({
      tripMiles: 50,
      startSocPercent: 80,
      batteryKwh: 60,
      efficiencyMiPerKwh: 3.5,
      targetReservePercent: 15,
      deratePercent: 10
    });
    expect(result.assumptions["tripMiles"]).toBe(50);
    expect(result.assumptions["startSocPercent"]).toBe(80);
    expect(result.assumptions["batteryKwh"]).toBe(60);
    expect(result.assumptions["efficiencyMiPerKwh"]).toBe(3.5);
    expect(result.assumptions["targetReservePercent"]).toBe(15);
    expect(result.assumptions["deratePercent"]).toBe(10);
    expect(result.assumptions["rangeSource"]).toBe("batteryKwh × efficiencyMiPerKwh");
  });

  it("applies derate correctly", () => {
    // 100 kWh × 3 mi/kWh = 300 mi rated; 10% derate → 270 mi derated; at 100% SOC
    const result = estimateRangeMargin({
      tripMiles: 50,
      startSocPercent: 100,
      batteryKwh: 100,
      efficiencyMiPerKwh: 3,
      deratePercent: 10
    });
    // derated = 270, available = 270, reserve = 27 (10%)
    // margin = 270 - 50 - 27 = 193
    expect(result.usableRangeMiles).toBe(270);
    expect(result.marginMiles).toBe(193);
    expect(result.withinReserve).toBe(true);
  });
});

describe("estimateRangeMargin — epaRangeMiles path", () => {
  it("uses epaRangeMiles when batteryKwh/efficiency not both provided", () => {
    // 250 mi EPA at 80% SOC = 200 mi available; trip=120, reserve=25 (10% of 250)
    const result = estimateRangeMargin({
      tripMiles: 120,
      startSocPercent: 80,
      epaRangeMiles: 250
    });
    expect(result.usableRangeMiles).toBe(200);
    expect(result.withinReserve).toBe(true);
    expect(result.assumptions["epaRangeMiles"]).toBe(250);
    expect(result.assumptions["rangeSource"]).toBe("epaRangeMiles");
  });
});

describe("estimateRangeMargin — risk thresholds", () => {
  it("returns risk='ok' for a comfortable trip", () => {
    const result = estimateRangeMargin({
      tripMiles: 50,
      startSocPercent: 100,
      epaRangeMiles: 300
    });
    expect(result.risk).toBe("ok");
    expect(result.withinReserve).toBe(true);
  });

  it("returns risk='insufficient' when trip exceeds available range", () => {
    // 100 mi EPA, 50% SOC = 50 mi available; trip=80 mi
    const result = estimateRangeMargin({
      tripMiles: 80,
      startSocPercent: 50,
      epaRangeMiles: 100
    });
    expect(result.risk).toBe("insufficient");
    expect(result.withinReserve).toBe(false);
    expect(result.marginMiles).toBeLessThan(0);
  });

  it("returns risk='insufficient' when no range source provided", () => {
    const result = estimateRangeMargin({
      tripMiles: 100,
      startSocPercent: 80
    });
    expect(result.risk).toBe("insufficient");
    expect(result.withinReserve).toBe(false);
    expect(result.caveats.some(c => c.includes("rated range"))).toBe(true);
  });

  it("returns risk='tight' when margin is small relative to reserve", () => {
    // 200 mi EPA, 100% SOC, 18% reserve = 36 mi reserve; trip=166 mi
    // available=200, reserve=36, margin=200-166-36=−2 → insufficient? No:
    // Let's design: 200 mi, 100% SOC, reserve=10%, trip=182
    // available=200, reserve=20, margin=200-182-20=-2 → insufficient
    // For tight: need margin >= 0 but < reserve*0.5
    // available=200, reserve=20, margin between 0-10
    // trip = 200 - 20 - 8 = 172 → margin = 8 (< 10 = reserve*0.5)
    const result = estimateRangeMargin({
      tripMiles: 172,
      startSocPercent: 100,
      epaRangeMiles: 200
    });
    expect(result.withinReserve).toBe(true);
    expect(result.risk).toBe("tight");
  });
});

describe("estimateRangeMargin — reserve and derate applied together", () => {
  it("applies custom reserve percentage", () => {
    const result = estimateRangeMargin({
      tripMiles: 50,
      startSocPercent: 100,
      epaRangeMiles: 200,
      targetReservePercent: 20
    });
    // available=200, reserve=40 (20%), margin=200-50-40=110
    expect(result.marginMiles).toBe(110);
    expect(result.assumptions["targetReservePercent"]).toBe(20);
  });
});

describe("estimateRangeMargin — caveats always present", () => {
  it("always returns at least one caveat", () => {
    const result = estimateRangeMargin({
      tripMiles: 50,
      startSocPercent: 80,
      epaRangeMiles: 200
    });
    expect(result.caveats.length).toBeGreaterThan(0);
  });
});
