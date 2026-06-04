export interface MaintenanceItem {
  item: string;
  intervalMiles: number;
  intervalMonths: number;
  severeServiceMiles?: number;
  note?: string;
}

export interface MaintenanceStatus {
  item: string;
  intervalMiles: number;
  effectiveIntervalMiles: number;
  milesUntilDue: number;
  dueNow: boolean;
  overdue: boolean;
}

/**
 * GENERIC, manufacturer-agnostic maintenance guidance. These are common
 * rule-of-thumb intervals — NOT a substitute for the OEM maintenance
 * schedule in the owner's manual, which is proprietary and varies by
 * engine, drivetrain, and severe-service conditions.
 */
export const GENERIC_SCHEDULE: MaintenanceItem[] = [
  { item: "Engine oil & filter (synthetic)", intervalMiles: 7500, intervalMonths: 12, severeServiceMiles: 5000 },
  { item: "Engine oil & filter (conventional)", intervalMiles: 3000, intervalMonths: 6 },
  { item: "Tire rotation", intervalMiles: 7500, intervalMonths: 6, severeServiceMiles: 5000 },
  { item: "Cabin air filter", intervalMiles: 15000, intervalMonths: 12 },
  { item: "Engine air filter", intervalMiles: 30000, intervalMonths: 36 },
  { item: "Brake fluid flush", intervalMiles: 30000, intervalMonths: 36 },
  { item: "Wheel alignment check", intervalMiles: 30000, intervalMonths: 24 },
  { item: "Coolant flush", intervalMiles: 60000, intervalMonths: 60 },
  { item: "Automatic transmission fluid", intervalMiles: 60000, intervalMonths: 72, severeServiceMiles: 45000 },
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

export interface ScheduleOptions {
  severe?: boolean;
}

export interface ScheduleResult {
  disclaimer: string;
  upcoming?: MaintenanceItem[];
  status?: MaintenanceStatus[];
  schedule: MaintenanceItem[];
}

const DISCLAIMER =
  "GENERIC guidance only — not OEM-specific. Always confirm against the owner's manual for this exact vehicle; intervals change with engine, drivetrain, and severe-service use.";

/**
 * Compute the signed miles until the next due boundary.
 * Negative = overdue, 0 = due exactly now, positive = upcoming.
 * Uses nearest multiple of the effective interval.
 */
function milesUntilDue(currentMileage: number, effectiveInterval: number): number {
  // Round to the nearest due boundary
  const nearest = Math.round(currentMileage / effectiveInterval) * effectiveInterval;
  return nearest - currentMileage;
}

/** Return the generic schedule; if mileage is given, flag items due soon. */
export function maintenanceSchedule(currentMileage?: number, options?: ScheduleOptions): ScheduleResult {
  const severe = options?.severe ?? false;

  if (currentMileage == null) {
    return { disclaimer: DISCLAIMER, schedule: GENERIC_SCHEDULE };
  }

  const statusList: MaintenanceStatus[] = GENERIC_SCHEDULE.map(m => {
    const effectiveIntervalMiles =
      severe && m.severeServiceMiles != null ? m.severeServiceMiles : m.intervalMiles;
    const miles = milesUntilDue(currentMileage, effectiveIntervalMiles);
    return {
      item: m.item,
      intervalMiles: m.intervalMiles,
      effectiveIntervalMiles,
      milesUntilDue: miles,
      dueNow: miles === 0,
      overdue: miles < 0
    };
  });

  const upcoming = GENERIC_SCHEDULE.filter((m, i) => {
    const effectiveIntervalMiles =
      severe && m.severeServiceMiles != null ? m.severeServiceMiles : m.intervalMiles;
    const since = currentMileage % effectiveIntervalMiles;
    // "Due soon" = within 1500 miles of the next interval boundary, or recently past one.
    return effectiveIntervalMiles - since <= 1500 || since <= 500;
  });

  return { disclaimer: DISCLAIMER, upcoming, status: statusList, schedule: GENERIC_SCHEDULE };
}
