export interface MaintenanceItem {
  item: string;
  intervalMiles: number;
  intervalMonths: number;
  note?: string;
}

/**
 * GENERIC, manufacturer-agnostic maintenance guidance. These are common
 * rule-of-thumb intervals — NOT a substitute for the OEM maintenance
 * schedule in the owner's manual, which is proprietary and varies by
 * engine, drivetrain, and severe-service conditions.
 */
export const GENERIC_SCHEDULE: MaintenanceItem[] = [
  { item: "Engine oil & filter (synthetic)", intervalMiles: 7500, intervalMonths: 12 },
  { item: "Engine oil & filter (conventional)", intervalMiles: 3000, intervalMonths: 6 },
  { item: "Tire rotation", intervalMiles: 7500, intervalMonths: 6 },
  { item: "Cabin air filter", intervalMiles: 15000, intervalMonths: 12 },
  { item: "Engine air filter", intervalMiles: 30000, intervalMonths: 36 },
  { item: "Brake fluid flush", intervalMiles: 30000, intervalMonths: 36 },
  { item: "Wheel alignment check", intervalMiles: 30000, intervalMonths: 24 },
  { item: "Coolant flush", intervalMiles: 60000, intervalMonths: 60 },
  { item: "Automatic transmission fluid", intervalMiles: 60000, intervalMonths: 72 },
  { item: "Spark plugs (copper)", intervalMiles: 30000, intervalMonths: 36 },
  { item: "Spark plugs (iridium/platinum)", intervalMiles: 100000, intervalMonths: 120 },
  { item: "Serpentine belt inspection", intervalMiles: 60000, intervalMonths: 60 },
  {
    item: "Timing belt (if equipped)",
    intervalMiles: 90000,
    intervalMonths: 84,
    note: "Interference engines: failure can destroy the engine. Verify the OEM interval."
  },
  {
    item: "Brake pads (inspect)",
    intervalMiles: 10000,
    intervalMonths: 12,
    note: "Replacement interval varies widely with driving style."
  }
];

export interface ScheduleResult {
  disclaimer: string;
  upcoming?: MaintenanceItem[];
  schedule: MaintenanceItem[];
}

const DISCLAIMER =
  "GENERIC guidance only — not OEM-specific. Always confirm against the owner's manual for this exact vehicle; intervals change with engine, drivetrain, and severe-service use.";

/** Return the generic schedule; if mileage is given, flag items roughly due. */
export function maintenanceSchedule(currentMileage?: number): ScheduleResult {
  if (currentMileage == null) {
    return { disclaimer: DISCLAIMER, schedule: GENERIC_SCHEDULE };
  }
  const upcoming = GENERIC_SCHEDULE.filter(m => {
    const since = currentMileage % m.intervalMiles;
    // "Due soon" = within 1500 miles of the next interval boundary.
    return m.intervalMiles - since <= 1500 || since <= 500;
  });
  return { disclaimer: DISCLAIMER, upcoming, schedule: GENERIC_SCHEDULE };
}
