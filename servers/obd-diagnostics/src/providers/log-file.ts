/**
 * Thin log-file provider.
 *
 * Takes raw scan-log `content` (a string) and runs it through parseScanLog.
 * Optionally, if an explicit filesystem `path` is provided, it reads that file
 * with node:fs/promises first. Filesystem access is GUARDED: it only happens
 * when a caller explicitly supplies a path, never implicitly.
 */

import { readFile } from "node:fs/promises";
import { parseScanLog, type ParsedScanLog, type ParseScanLogOptions } from "../domain/logs.js";

export type IngestLogInput = {
  /** Raw log text. Required unless `path` is provided. */
  content?: string;
  /** Optional explicit filesystem path to read the log from. */
  path?: string;
} & ParseScanLogOptions;

/**
 * Resolve log content (from inline `content` or, only if explicitly given, a
 * filesystem `path`) and parse it. Throws a clear error if neither is provided.
 */
export async function ingestScanLog(input: IngestLogInput): Promise<ParsedScanLog> {
  const { content, path, ...opts } = input;

  let text = content;
  if ((text === undefined || text === "") && typeof path === "string" && path.trim() !== "") {
    // Only touch the filesystem when a path is explicitly supplied.
    text = await readFile(path, "utf8");
  }

  if (text === undefined) {
    throw new Error("Provide either `content` (raw log text) or an explicit `path` to read.");
  }

  return parseScanLog(text, opts);
}
