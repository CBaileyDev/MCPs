/**
 * Preload bridge. Exposes a tiny, typed `window.garage` surface to the renderer
 * (no Node internals leak through). It only covers the serial-port picker
 * handshake and app info — the renderer does the OBD work itself via Web Serial.
 */

import { contextBridge, ipcRenderer } from "electron";
import { IPC, type AppInfo, type HistoryRecord, type SerialPortInfo } from "../shared/ipc.js";

const api = {
  /** Subscribe to the list of serial ports Electron offers; returns an unsubscribe. */
  onSerialPorts(listener: (ports: SerialPortInfo[]) => void): () => void {
    const handler = (_e: unknown, ports: SerialPortInfo[]) => listener(ports);
    ipcRenderer.on(IPC.SerialPorts, handler);
    return () => ipcRenderer.removeListener(IPC.SerialPorts, handler);
  },
  /** Tell main which port the user picked ("" cancels the pending request). */
  chooseSerialPort(portId: string): void {
    ipcRenderer.send(IPC.SerialChoose, portId);
  },
  /** Runtime/app info for the About area. */
  appInfo(): Promise<AppInfo> {
    return ipcRenderer.invoke(IPC.AppInfo);
  },
  /** Saved-scan history (persisted in the app's user-data dir). */
  history: {
    list(): Promise<HistoryRecord[]> {
      return ipcRenderer.invoke(IPC.HistoryList);
    },
    save(record: HistoryRecord): Promise<HistoryRecord[]> {
      return ipcRenderer.invoke(IPC.HistorySave, record);
    },
    clear(): Promise<void> {
      return ipcRenderer.invoke(IPC.HistoryClear);
    }
  }
};

export type GarageBridge = typeof api;

contextBridge.exposeInMainWorld("garage", api);
