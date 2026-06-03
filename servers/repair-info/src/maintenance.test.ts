import { describe, expect, it } from "vitest";
import { maintenanceSchedule } from "./maintenance.js";

describe("maintenanceSchedule", () => {
  it("returns the full generic schedule with a disclaimer and no 'upcoming'", () => {
    const result = maintenanceSchedule();
    expect(result.schedule.length).toBeGreaterThan(5);
    expect(result.disclaimer).toMatch(/GENERIC/);
    expect(result.upcoming).toBeUndefined();
  });

  it("flags items due soon when mileage is near an interval", () => {
    const result = maintenanceSchedule(7400); // just under the 7500-mile oil/tire interval
    expect(result.upcoming).toBeDefined();
    expect(result.upcoming!.length).toBeGreaterThan(0);
  });
});
