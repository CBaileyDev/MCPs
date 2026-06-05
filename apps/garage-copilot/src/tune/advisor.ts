/**
 * Read-side TUNE ADVISOR: pure planning math that validates proposed changes
 * before you commit to them. This is the safe interpretation of "tune" — it
 * NEVER writes to an ECU or flashes anything. It quantifies the consequence of a
 * change and flags concerns, the same arithmetic the drivetrain-gearing,
 * engine-build-math, and automotive-electrical MCP servers expose, gathered here
 * around the "I'm thinking of changing X" question.
 *
 * Each assessment returns a structured result plus a caveat; the actual flashing
 * (if any) is done with a proper licensed tuning tool, and on-road emissions
 * tuning is regulated — see the README.
 */

const r2 = (n: number): number => Math.round(n * 100) / 100;

export type Assessment = {
  ok: boolean;
  summary: string;
  details: Record<string, number | string>;
  notes: string[];
};

const INCHES_PER_MILE = 63360;

/**
 * Effect of a final-drive (or tire diameter) change on cruise RPM at a fixed
 * speed and top-gear ratio. Higher numeric final drive = higher RPM = more
 * acceleration, worse economy.
 */
export function assessFinalDriveChange(input: {
  speedMph: number;
  tireDiameterIn: number;
  topGearRatio: number;
  currentFinalDrive: number;
  newFinalDrive: number;
}): Assessment {
  for (const [k, v] of Object.entries(input)) {
    if (!(typeof v === "number") || !isFinite(v) || v <= 0) {
      throw new Error(`assessFinalDriveChange: ${k} must be a positive number`);
    }
  }
  const rpmAt = (finalDrive: number): number => {
    const circ = Math.PI * input.tireDiameterIn; // inches per wheel rev
    const wheelRev = (input.speedMph * INCHES_PER_MILE) / 60 / circ; // wheel rev/min
    return wheelRev * input.topGearRatio * finalDrive;
  };
  const currentRpm = rpmAt(input.currentFinalDrive);
  const newRpm = rpmAt(input.newFinalDrive);
  const deltaPct = r2(((newRpm - currentRpm) / currentRpm) * 100);

  const notes: string[] = [];
  if (Math.abs(deltaPct) >= 10) {
    notes.push("This is a large gearing change — re-check cruise comfort, economy, and that the speedometer/ECU is recalibrated.");
  }
  notes.push("Assumes no driveline slip; verify against the actual vehicle.");

  return {
    ok: true,
    summary: `At ${input.speedMph} mph in top gear, RPM goes ${currentRpm < newRpm ? "up" : "down"} from ${r2(
      currentRpm
    )} to ${r2(newRpm)} (${deltaPct > 0 ? "+" : ""}${deltaPct}%).`,
    details: {
      currentRpm: r2(currentRpm),
      newRpm: r2(newRpm),
      deltaPct
    },
    notes
  };
}

/**
 * Minimum injector size (cc/min, per injector) to support a power target, and
 * whether a proposed injector clears it with headroom. Mirrors engine-build-math:
 * fuel mass = HP × BSFC; per-injector flow capped by max duty cycle.
 */
export function assessInjectorsForTarget(input: {
  targetHp: number;
  cylinders: number;
  /** Brake-specific fuel consumption (lb/hp/hr). NA ~0.5, forced ~0.6. */
  bsfc?: number;
  /** Max duty cycle to size against (0–1, default 0.85). */
  maxDutyCycle?: number;
  /** Fuel density g/cc (gasoline ~0.72, E85 ~0.78). */
  fuelDensity?: number;
  /** Proposed injector size in cc/min, to check against the requirement. */
  proposedCcMin?: number;
}): Assessment {
  const bsfc = input.bsfc ?? 0.5;
  const duty = input.maxDutyCycle ?? 0.85;
  const density = input.fuelDensity ?? 0.72;
  if (input.targetHp <= 0 || input.cylinders <= 0) {
    throw new Error("assessInjectorsForTarget: targetHp and cylinders must be positive");
  }
  if (duty <= 0 || duty > 1) throw new Error("assessInjectorsForTarget: maxDutyCycle must be in (0,1]");

  const totalLbHr = input.targetHp * bsfc; // total fuel mass flow
  const perInjLbHr = totalLbHr / input.cylinders;
  // lb/hr -> cc/min: (lb/hr × 453.592 g/lb) / 60 min / density g/cc, then / duty
  const requiredCcMin = r2(((perInjLbHr * 453.592) / 60 / density) / duty);

  const notes = [
    `Sized at ${Math.round(duty * 100)}% max duty cycle, ${bsfc} BSFC, ${density} g/cc fuel.`,
    "Static-flow estimate; real injectors need dead-time/PW tuning and a matching fuel pump."
  ];

  if (input.proposedCcMin === undefined) {
    return {
      ok: true,
      summary: `Need at least ${requiredCcMin} cc/min per injector for ${input.targetHp} hp across ${input.cylinders} cylinders.`,
      details: { requiredCcMin, perInjectorLbHr: r2(perInjLbHr), totalLbHr: r2(totalLbHr) },
      notes
    };
  }

  const headroomPct = r2(((input.proposedCcMin - requiredCcMin) / requiredCcMin) * 100);
  const ok = input.proposedCcMin >= requiredCcMin;
  return {
    ok,
    summary: ok
      ? `${input.proposedCcMin} cc/min clears the ${requiredCcMin} cc/min requirement (${headroomPct >= 0 ? "+" : ""}${headroomPct}% headroom).`
      : `${input.proposedCcMin} cc/min is BELOW the ${requiredCcMin} cc/min requirement (${headroomPct}%). Too small for ${input.targetHp} hp.`,
    details: { requiredCcMin, proposedCcMin: input.proposedCcMin, headroomPct },
    notes
  };
}

/**
 * Whether adding an electrical accessory load fits the charging system. Compares
 * total steady-state current against the alternator rating. Mirrors
 * automotive-electrical's load reasoning.
 */
export function assessAddedElectricalLoad(input: {
  systemVoltage: number;
  existingLoadA: number;
  addedWatts: number;
  alternatorRatedA: number;
}): Assessment {
  if (input.systemVoltage <= 0 || input.alternatorRatedA <= 0) {
    throw new Error("assessAddedElectricalLoad: systemVoltage and alternatorRatedA must be positive");
  }
  if (input.existingLoadA < 0 || input.addedWatts < 0) {
    throw new Error("assessAddedElectricalLoad: loads must be non-negative");
  }
  const addedAmps = r2(input.addedWatts / input.systemVoltage);
  const totalAmps = r2(input.existingLoadA + addedAmps);
  const utilizationPct = r2((totalAmps / input.alternatorRatedA) * 100);

  const notes: string[] = ["Steady-state estimate; inrush and idle-RPM output are not modeled."];
  let ok = true;
  if (utilizationPct >= 100) {
    ok = false;
    notes.push("Total exceeds the alternator rating — the battery will discharge under load. Upgrade the alternator or shed load.");
  } else if (utilizationPct >= 80) {
    notes.push("Above 80% of alternator capacity — little margin at idle or with everything on.");
  }

  return {
    ok,
    summary: `Adding ${input.addedWatts} W draws ~${addedAmps} A; total ~${totalAmps} A is ${utilizationPct}% of the ${input.alternatorRatedA} A alternator.`,
    details: { addedAmps, totalAmps, utilizationPct },
    notes
  };
}
