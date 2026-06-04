import { describe, expect, it } from "vitest";
import { maintenanceSchedule, GENERIC_SCHEDULE } from "./maintenance.js";

describe("maintenanceSchedule", () => {
  // -------------------------------------------------------------------------
  // Existing tests (preserved)
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Disclaimer always present
  // -------------------------------------------------------------------------

  it("always includes the GENERIC disclaimer regardless of inputs", () => {
    expect(maintenanceSchedule().disclaimer).toMatch(/GENERIC/);
    expect(maintenanceSchedule(50000).disclaimer).toMatch(/GENERIC/);
    expect(maintenanceSchedule(10000, { severe: true }).disclaimer).toMatch(/GENERIC/);
  });

  // -------------------------------------------------------------------------
  // status field
  // -------------------------------------------------------------------------

  it("returns a status array when mileage is provided", () => {
    const result = maintenanceSchedule(15000);
    expect(result.status).toBeDefined();
    expect(Array.isArray(result.status)).toBe(true);
    expect(result.status!.length).toBe(GENERIC_SCHEDULE.length);
  });

  it("does not return a status array when no mileage is provided", () => {
    const result = maintenanceSchedule();
    expect(result.status).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // milesUntilDue / dueNow / overdue correctness
  // -------------------------------------------------------------------------

  it("marks an item as overdue when mileage is past the nearest interval boundary", () => {
    // At 7600, nearest 7500-boundary is 7500; mileage - nearest = 100 miles over
    // milesUntilDue = nearest - mileage = 7500 - 7600 = -100
    const result = maintenanceSchedule(7600);
    const oilStatus = result.status!.find(s => s.item === "Engine oil & filter (synthetic)");
    expect(oilStatus).toBeDefined();
    expect(oilStatus!.milesUntilDue).toBe(-100); // 7500 - 7600 = -100
    expect(oilStatus!.overdue).toBe(true);
    expect(oilStatus!.dueNow).toBe(false);
  });

  it("marks an item as dueNow when mileage lands exactly on an interval", () => {
    const result = maintenanceSchedule(7500);
    const oilStatus = result.status!.find(s => s.item === "Engine oil & filter (synthetic)");
    expect(oilStatus).toBeDefined();
    expect(oilStatus!.milesUntilDue).toBe(0);
    expect(oilStatus!.dueNow).toBe(true);
    expect(oilStatus!.overdue).toBe(false);
  });

  it("reports positive milesUntilDue for an upcoming item", () => {
    // At 7000, next 7500 boundary = 7500; milesUntilDue = 7500 - 7000 = 500
    const result = maintenanceSchedule(7000);
    const oilStatus = result.status!.find(s => s.item === "Engine oil & filter (synthetic)");
    expect(oilStatus).toBeDefined();
    expect(oilStatus!.milesUntilDue).toBe(500);
    expect(oilStatus!.overdue).toBe(false);
    expect(oilStatus!.dueNow).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Severe service
  // -------------------------------------------------------------------------

  it("uses the shorter severe-service interval for synthetic oil when severe=true", () => {
    // synthetic oil: intervalMiles=7500, severeServiceMiles=5000
    const result = maintenanceSchedule(5000, { severe: true });
    const oilStatus = result.status!.find(s => s.item === "Engine oil & filter (synthetic)");
    expect(oilStatus).toBeDefined();
    expect(oilStatus!.effectiveIntervalMiles).toBe(5000);
    // At 5000 with interval 5000: nearest = 5000; milesUntilDue = 0; dueNow
    expect(oilStatus!.milesUntilDue).toBe(0);
    expect(oilStatus!.dueNow).toBe(true);
  });

  it("uses the standard interval for synthetic oil when severe=false", () => {
    const result = maintenanceSchedule(5000, { severe: false });
    const oilStatus = result.status!.find(s => s.item === "Engine oil & filter (synthetic)");
    expect(oilStatus).toBeDefined();
    expect(oilStatus!.effectiveIntervalMiles).toBe(7500);
  });

  it("uses the shorter severe-service interval for ATF when severe=true", () => {
    // ATF: intervalMiles=60000, severeServiceMiles=45000
    const result = maintenanceSchedule(45000, { severe: true });
    const atfStatus = result.status!.find(s => s.item === "Automatic transmission fluid");
    expect(atfStatus).toBeDefined();
    expect(atfStatus!.effectiveIntervalMiles).toBe(45000);
    expect(atfStatus!.dueNow).toBe(true);
  });

  it("uses the standard interval for ATF when severe is not set", () => {
    const result = maintenanceSchedule(45000);
    const atfStatus = result.status!.find(s => s.item === "Automatic transmission fluid");
    expect(atfStatus).toBeDefined();
    expect(atfStatus!.effectiveIntervalMiles).toBe(60000);
  });

  it("uses shorter severe interval for tire rotation when severe=true", () => {
    // tire rotation: intervalMiles=7500, severeServiceMiles=5000
    const result = maintenanceSchedule(5000, { severe: true });
    const tireStatus = result.status!.find(s => s.item === "Tire rotation");
    expect(tireStatus).toBeDefined();
    expect(tireStatus!.effectiveIntervalMiles).toBe(5000);
    expect(tireStatus!.dueNow).toBe(true);
  });

  it("severe=true does not alter intervals for items without severeServiceMiles", () => {
    const result = maintenanceSchedule(30000, { severe: true });
    const airFilter = result.status!.find(s => s.item === "Cabin air filter");
    expect(airFilter).toBeDefined();
    // Cabin air filter has no severeServiceMiles, so effective == standard
    expect(airFilter!.effectiveIntervalMiles).toBe(airFilter!.intervalMiles);
  });

  // -------------------------------------------------------------------------
  // upcoming with severe
  // -------------------------------------------------------------------------

  it("upcoming respects severe interval — items due sooner appear at severe mileage", () => {
    // At 4500 miles, severe tire rotation (5000 interval): 500 miles from 5000 → should appear
    const severResult = maintenanceSchedule(4500, { severe: true });
    const normalResult = maintenanceSchedule(4500);

    const severeHasTireUpcoming = severResult.upcoming?.some(m => m.item === "Tire rotation");
    // Not guaranteed for normal (7500 interval, 4500 miles, 3000 remaining — outside the window)
    // but severe (5000 interval) puts us within 500 miles of next → should be upcoming
    expect(severeHasTireUpcoming).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Backward compatibility
  // -------------------------------------------------------------------------

  it("schedule field always contains the full GENERIC_SCHEDULE", () => {
    expect(maintenanceSchedule().schedule).toBe(GENERIC_SCHEDULE);
    expect(maintenanceSchedule(10000).schedule).toBe(GENERIC_SCHEDULE);
    expect(maintenanceSchedule(10000, { severe: true }).schedule).toBe(GENERIC_SCHEDULE);
  });
});
