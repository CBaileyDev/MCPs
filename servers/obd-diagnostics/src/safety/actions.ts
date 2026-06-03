/**
 * Safety boundary for OBD actions.
 *
 * This server is READ-ONLY in v1. No tool exposes a destructive action, but
 * this module guards the boundary: any code path that is handed an action name
 * runs it through assertReadOnly, which throws for anything that would write to
 * the vehicle (clear codes, ECU writes, active tests, adaptations, or
 * manufacturer-specific commands).
 */

/** Destructive / out-of-scope OBD actions that are explicitly forbidden in v1. */
export const FORBIDDEN_ACTIONS = [
  "clear_dtcs",
  "clear_codes",
  "reset_mil",
  "ecu_write",
  "write_memory",
  "active_test",
  "actuator_test",
  "adaptation",
  "reset_adaptation",
  "manufacturer_specific",
  "key_coding"
] as const;

export type ForbiddenAction = (typeof FORBIDDEN_ACTIONS)[number];

const FORBIDDEN_SET = new Set<string>(FORBIDDEN_ACTIONS);

/** True if the given action is a known destructive/forbidden action. */
export function isForbiddenAction(action: string): boolean {
  return FORBIDDEN_SET.has(action.trim().toLowerCase());
}

/**
 * Assert that an action is read-only. Throws a clear error for any forbidden
 * (destructive) action. Returns void for permitted actions. This is the
 * boundary guard — it does not perform any I/O.
 */
export function assertReadOnly(action: string): void {
  if (isForbiddenAction(action)) {
    throw new Error(
      `Refused destructive OBD action "${action}". This server is read-only (v1): ` +
        `clearing codes, ECU writes, active tests, adaptations, and manufacturer-specific ` +
        `commands are not supported.`
    );
  }
}
