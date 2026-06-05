/**
 * A Web Serial implementation of the engine's {@link ObdTransport}.
 *
 * This is the bridge to a real OBD-II dongle in the browser/Electron renderer:
 * it opens a Web Serial `SerialPort`, writes ELM327 commands, and forwards
 * incoming bytes (decoded to text) to the engine's driver, which reassembles
 * them up to the ">" prompt. No native modules involved.
 *
 * `SerialPortLike` is a structural subset of the Web Serial `SerialPort` so the
 * transport can be unit-tested with in-memory Web Streams.
 */

import type { ObdTransport } from "./core.js";

export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

export type WebSerialOptions = {
  /** Baud rate (ELM327 USB clones default to 38400). */
  baudRate?: number;
  description?: string;
};

export class WebSerialTransport implements ObdTransport {
  readonly description: string;
  private readonly baudRate: number;
  private readonly listeners = new Set<(chunk: string) => void>();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private closed = false;

  constructor(private readonly port: SerialPortLike, options: WebSerialOptions = {}) {
    this.baudRate = options.baudRate ?? 38400;
    this.description = options.description ?? "Web Serial OBD-II adapter";
  }

  /** Open the port and start pumping bytes to listeners. Call once before use. */
  async start(): Promise<void> {
    await this.port.open({ baudRate: this.baudRate });
    if (!this.port.writable || !this.port.readable) {
      throw new Error("Serial port did not expose readable/writable streams.");
    }
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    void this.pump();
  }

  private async pump(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          const text = this.decoder.decode(value, { stream: true });
          if (text.length > 0) {
            for (const listener of this.listeners) listener(text);
          }
        }
      }
    } catch {
      // Reader cancelled / port closed — stop quietly.
    }
  }

  async write(data: string): Promise<void> {
    if (!this.writer) throw new Error("Transport not started — call start() first.");
    await this.writer.write(this.encoder.encode(data));
  }

  onData(listener: (chunk: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    this.closed = true;
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      this.reader?.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      await this.writer?.close();
    } catch {
      /* ignore */
    }
    try {
      this.writer?.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      await this.port.close();
    } catch {
      /* ignore */
    }
    this.listeners.clear();
  }
}
