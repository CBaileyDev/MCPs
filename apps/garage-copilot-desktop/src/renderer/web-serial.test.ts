import { describe, it, expect } from "vitest";
import { WebSerialTransport, type SerialPortLike } from "./web-serial.js";
import { Elm327Client, DEMO_VEHICLE } from "./core.js";

/**
 * A fake Web Serial port backed by in-memory Web Streams (Node globals). It
 * mirrors real SerialPort lifecycle: open() creates fresh readable/writable
 * streams, close() drops them — so the close→reopen (reconnect) path is
 * exercised. On each write it enqueues the scripted ELM327 response terminated
 * with the ">" prompt, exactly like a real dongle.
 */
function fakePort(script: Record<string, string>): SerialPortLike {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const port: SerialPortLike = {
    readable: null,
    writable: null,
    async open() {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      port.readable = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
        cancel() {
          /* unblock pump */
        }
      });
      port.writable = new WritableStream<Uint8Array>({
        write(chunk) {
          const cmd = dec.decode(chunk).replace(/[\r\n]+$/g, "").replace(/\s+/g, "").toUpperCase();
          const body = cmd in script ? script[cmd] : "NO DATA";
          queueMicrotask(() => controller.enqueue(enc.encode(`${body}\r>`)));
        }
      });
    },
    async close() {
      port.readable = null;
      port.writable = null;
    }
  };
  return port;
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

  it("closes cleanly and the port can be reopened (reconnect)", async () => {
    const port = fakePort(DEMO_VEHICLE);

    const t1 = new WebSerialTransport(port);
    await t1.start();
    const c1 = new Elm327Client(t1);
    expect((await c1.readLivePid("0C"))?.value).toBe(812);
    await expect(c1.close()).resolves.toBeUndefined(); // close() resolves, no hang/lock error

    // Reconnect on the same port — only possible if close released both locks.
    const t2 = new WebSerialTransport(port);
    await t2.start();
    const c2 = new Elm327Client(t2);
    expect((await c2.readLivePid("05"))?.value).toBe(89);
    await c2.close();
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
