import { describe, it, expect } from "vitest";
import { WebSerialTransport, type SerialPortLike } from "./web-serial.js";
import { Elm327Client, DEMO_VEHICLE } from "./core.js";

/**
 * A fake Web Serial port backed by in-memory Web Streams (available as Node
 * globals). On each write it looks up the scripted ELM327 response and enqueues
 * it on the readable side, terminated with the ">" prompt — exactly what a real
 * dongle does. This exercises the WebSerialTransport + the real engine driver
 * end-to-end with no hardware.
 */
function fakePort(script: Record<string, string>): SerialPortLike {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    }
  });
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      const cmd = dec.decode(chunk).replace(/[\r\n]+$/g, "").replace(/\s+/g, "").toUpperCase();
      const body = cmd in script ? script[cmd] : "NO DATA";
      queueMicrotask(() => controller.enqueue(enc.encode(`${body}\r>`)));
    }
  });
  return { open: async () => undefined, close: async () => undefined, readable, writable };
}

describe("WebSerialTransport", () => {
  it("drives the engine over Web Serial streams against the demo vehicle", async () => {
    const transport = new WebSerialTransport(fakePort(DEMO_VEHICLE));
    await transport.start();
    const client = new Elm327Client(transport);

    const id = await client.initialize();
    expect(id.description).toMatch(/ELM327/);

    const status = await client.readMonitorStatus();
    expect(status.milOn).toBe(true);
    expect(status.dtcCount).toBe(2);

    expect(await client.readStoredDtcs()).toEqual(["P0301", "P0420"]);
    expect((await client.readLivePid("0C"))?.value).toBe(812);
    expect(await client.readVoltage()).toBe(14.2);

    await client.close();
  });

  it("throws a clear error if the port exposes no streams", async () => {
    const broken: SerialPortLike = {
      open: async () => undefined,
      close: async () => undefined,
      readable: null,
      writable: null
    };
    const transport = new WebSerialTransport(broken);
    await expect(transport.start()).rejects.toThrow(/readable\/writable/);
  });
});
