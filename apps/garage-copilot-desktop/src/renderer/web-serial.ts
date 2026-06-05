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
  /**
   * Called if the read loop fails unexpectedly (e.g. the adapter is unplugged).
   * Not called for an intentional {@link WebSerialTransport.close}. Lets the UI
   * react to a dropped connection instead of silently freezing.
   */
  onError?: (error: Error) => void;
};

export class WebSerialTransport implements ObdTransport {
  readonly description: string;
  private readonly baudRate: number;
  private readonly listeners = new Set<(chunk: string) => void>();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private pumpDone?: Promise<void>;
  private closed = false;
  private readonly onError?: (error: Error) => void;

  constructor(private readonly port: SerialPortLike, options: WebSerialOptions = {}) {
    this.baudRate = options.baudRate ?? 38400;
    this.description = options.description ?? "Web Serial OBD-II adapter";
    this.onError = options.onError;
  }

  /** Open the port and start pumping bytes to listeners. Call once before use. */
  async start(): Promise<void> {
    await this.port.open({ baudRate: this.baudRate });
    if (!this.port.writable || !this.port.readable) {
      throw new Error("Serial port did not expose readable/writable streams.");
    }
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.pumpDone = this.pump();
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
    } catch (err) {
      // A throw here while we are NOT closing means the adapter dropped (USB
      // unplug, power loss). Surface it so the UI can recover; stay quiet when
      // the throw is just our own close() cancelling the read.
      if (!this.closed) {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      // Release the lock here (after the read loop has actually stopped) so
      // close() can shut the port without a "still locked" error — which is what
      // otherwise leaves the port unusable and makes reconnect glitch.
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
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
    // 1. Cancel the reader — this unblocks the pump's pending read().
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    // 2. Wait for the pump loop to actually finish and release its reader lock.
    try {
      await this.pumpDone;
    } catch {
      /* ignore */
    }
    // 3. Release the writer lock (do NOT await writer.close(), which can hang if
    //    a write is mid-flight — port.close() tears the stream down anyway).
    try {
      this.writer?.releaseLock();
    } catch {
      /* ignore */
    }
    // 4. With both locks released, the port closes cleanly and can be reopened.
    try {
      await this.port.close();
    } catch {
      /* ignore */
    }
    this.listeners.clear();
  }
}
