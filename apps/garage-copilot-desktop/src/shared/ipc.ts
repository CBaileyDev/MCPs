/**
 * IPC contract shared between the Electron main and renderer processes.
 *
 * The renderer does ALL the OBD work itself via the Web Serial API; the only
 * thing it needs from main is the native serial-port picker that Electron's
 * `select-serial-port` flow drives. These channels carry that handshake.
 */

/** A serial port offered by Electron's picker. */
export type SerialPortInfo = {
  portId: string;
  portName?: string;
  displayName?: string;
  vendorId?: string;
  productId?: string;
};

export const IPC = {
  /** main -> renderer: here is the list of ports to choose from. */
  SerialPorts: "serial:ports",
  /** renderer -> main: the user picked this portId ("" to cancel). */
  SerialChoose: "serial:choose",
  /** renderer -> main: get app/runtime info. */
  AppInfo: "app:info"
} as const;

export type AppInfo = {
  appVersion: string;
  electron: string;
  chrome: string;
  platform: string;
};
