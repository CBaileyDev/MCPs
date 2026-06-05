/**
 * Pure formatting helpers for the renderer, kept separate from the DOM so they
 * can be unit-tested in Node.
 */

import type { TimedSample } from "./core.js";

/** Build a CSV from recorded live samples. */
export function toCsv(samples: TimedSample[]): string {
  const header = "time_iso,pid,label,value,unit";
  const rows = samples.map(
    s => `${new Date(s.t).toISOString()},${s.pid},"${s.label.replace(/"/g, '""')}",${s.value},${s.unit ?? ""}`
  );
  return [header, ...rows].join("\n");
}

/** CSS class for a report line — colour readiness/MIL/warnings consistently. */
export function lineSeverityClass(line: string): string {
  if (line.startsWith("✗") || /not-ready|MIL.*ON|: ON\b/.test(line)) return "row row--warn";
  if (line.startsWith("✓")) return "row row--ok";
  return "row";
}

/**
 * Push an item onto a rolling buffer, dropping the oldest so length never
 * exceeds `max`. Mutates and returns the array. Keeps the live-monitor sample
 * buffer bounded so memory and per-tick trend analysis stay flat over a long
 * session.
 */
export function boundedPush<T>(buffer: T[], item: T, max: number): T[] {
  buffer.push(item);
  if (buffer.length > max) buffer.splice(0, buffer.length - max);
  return buffer;
}

/** A standard web search URL for a DTC code (for the "look up" affordance). */
export function dtcSearchUrl(code: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`OBD-II ${code} trouble code`)}`;
}

/** Extract a leading DTC code (e.g. "P0301") from a report line, if present. */
export function dtcCodeInLine(line: string): string | undefined {
  const match = line.match(/\b([PCBU][0-3][0-9A-F]{3})\b/);
  return match ? match[1] : undefined;
}
