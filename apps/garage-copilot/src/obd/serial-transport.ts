/**
 * Real serial-port {@link ObdTransport} for a USB/Bluetooth ELM327 dongle.
 *
 * The `serialport` package is a NATIVE dependency, so it is intentionally NOT
 * listed in package.json (keeping build/test hermetic, matching the rest of this
 * repo). It is loaded lazily here via a dynamic import with a non-literal
 * specifier — that keeps TypeScript from requiring its types at compile time and
 * lets the package build and test without the module present. Install it
 * yourself (`npm install serialport`) when you want to talk to real hardware; if
 * it is missing, this throws a clear, actionable error.
 *
 * ELM327 framing note: responses are terminated by a ">" prompt, not newlines,
 * so this transport forwards raw bytes and lets Elm327Client reassemble up to
 * the prompt (rather than using a line parser).
 */

import type { ObdTransport } from "./transport.js";

export type SerialOptions = {
  /** Baud rate (ELM327 USB clones are typically 38400; some are 9600 or 115200). */
  baudRate?: number;
};

export async function openSerialTransport(
  path: string,
  options: SerialOptions = {}
): Promise<ObdTransport> {
  // Annotated as `string` (not a literal) so TS does not resolve the module at
  // build time — it is genuinely optional and loaded only when present.
  const moduleName: string = "serialport";
  let SerialPortCtor: new (opts: { path: string; baudRate: number }) => SerialPortLike;
  try {
    // Non-literal specifier: TS treats this as `any`, so no types are needed at
    // build time and the module is only required at runtime.
    const mod = (await import(moduleName)) as { SerialPort: typeof SerialPortCtor };
    SerialPortCtor = mod.SerialPort;
  } catch {
    throw new Error(
      "The 'serialport' package is not installed. Run `npm install serialport` in apps/garage-copilot " +
        "to talk to a real ELM327 adapter, or use the offline replay adapter (`--demo`)."
    );
  }

  const baudRate = options.baudRate ?? 38400;
  const port = new SerialPortCtor({ path, baudRate });

  await new Promise<void>((resolve, reject) => {
    port.once("open", () => resolve());
    port.once("error", (err: Error) => reject(err));
  });

  return {
    description: `serial:${path}@${baudRate}`,
    write: (data: string) =>
      new Promise<void>((resolve, reject) => {
        port.write(data, (err?: Error | null) => (err ? reject(err) : resolve()));
      }),
    onData: (listener: (chunk: string) => void) => {
      const handler = (chunk: Buffer) => listener(chunk.toString("ascii"));
      port.on("data", handler);
      return () => port.off("data", handler);
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        port.close((err?: Error | null) => (err ? reject(err) : resolve()));
      })
  };
}

/** Minimal structural shape of the bits of `serialport`'s SerialPort we use. */
interface SerialPortLike {
  once(event: "open", cb: () => void): void;
  once(event: "error", cb: (err: Error) => void): void;
  on(event: "data", cb: (chunk: Buffer) => void): void;
  off(event: "data", cb: (chunk: Buffer) => void): void;
  write(data: string, cb: (err?: Error | null) => void): void;
  close(cb: (err?: Error | null) => void): void;
}
