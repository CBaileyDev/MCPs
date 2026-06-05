/**
 * An in-memory {@link ObdTransport} that replays scripted responses.
 *
 * This is what lets Garage Copilot run end-to-end with NO hardware: the CLI's
 * `--demo` mode and the test suite both drive the real Elm327Client through this
 * transport. A script maps a normalized command (uppercase, whitespace removed,
 * trailing "\r" dropped) to a response body; the transport appends the ELM327
 * "\r>" prompt so the driver's parser behaves exactly as it would on a wire.
 */

import type { ObdTransport } from "./transport.js";

export type ReplayScript = Record<string, string>;

export type ReplayOptions = {
  /** Response body returned for any command not in the script (default "NO DATA"). */
  fallback?: string;
  /** Description string for the transport. */
  description?: string;
};

/** Normalize a command for script lookup: uppercase, no whitespace, no CR. */
export function normalizeCommand(command: string): string {
  return command.replace(/[\r\n]+$/g, "").replace(/\s+/g, "").toUpperCase();
}

export class ReplayTransport implements ObdTransport {
  readonly description: string;
  private readonly fallback: string;
  private readonly listeners = new Set<(chunk: string) => void>();
  /** Commands received, in order — handy for assertions in tests. */
  readonly sent: string[] = [];

  constructor(private readonly script: ReplayScript, options: ReplayOptions = {}) {
    this.fallback = options.fallback ?? "NO DATA";
    this.description = options.description ?? "replay (offline, no hardware)";
  }

  async write(data: string): Promise<void> {
    const command = normalizeCommand(data);
    this.sent.push(command);
    const body = command in this.script ? this.script[command] : this.fallback;
    const frame = `${body}\r>`;
    // Deliver asynchronously, as a real adapter would, after write resolves.
    queueMicrotask(() => {
      for (const listener of this.listeners) listener(frame);
    });
  }

  onData(listener: (chunk: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    this.listeners.clear();
  }
}
