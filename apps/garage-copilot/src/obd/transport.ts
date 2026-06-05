/**
 * Byte-stream transport abstraction for talking to an ELM327-style OBD adapter.
 *
 * The protocol driver (./elm327.ts) is written entirely against this interface,
 * so it has NO knowledge of serial ports, Bluetooth, or any native module. That
 * keeps the driver 100% unit-testable: tests drive it with a scripted in-memory
 * transport (./replay-transport.ts), and the real `serialport`-backed transport
 * (./serial-transport.ts) is a thin, lazily-loaded adapter the rest of the code
 * never imports directly.
 */

/** A bidirectional text/byte transport to an OBD adapter. */
export interface ObdTransport {
  /** A short human description of the transport (e.g. the port path). */
  readonly description: string;
  /** Write a command string to the adapter (the driver appends "\r"). */
  write(data: string): Promise<void>;
  /**
   * Subscribe to incoming text chunks from the adapter. Chunks may arrive split
   * across multiple calls; the driver reassembles them up to the ">" prompt.
   * Returns an unsubscribe function.
   */
  onData(listener: (chunk: string) => void): () => void;
  /** Close the transport and release any underlying resource. */
  close(): Promise<void>;
}
