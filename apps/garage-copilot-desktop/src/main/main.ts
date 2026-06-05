/**
 * Electron main process — deliberately tiny.
 *
 * All OBD logic lives in the renderer (it talks to the dongle over the Web Serial
 * API). Main only: creates the window, enables Web Serial, and drives the native
 * serial-port picker by forwarding Electron's `select-serial-port` list to the
 * renderer and relaying the user's choice back. No native serial module, so
 * nothing to rebuild against Electron's ABI.
 */

import { app, BrowserWindow, ipcMain, Menu, session, shell, type IpcMainEvent, type MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import { IPC, type AppInfo, type SerialPortInfo } from "../shared/ipc.js";

/** Resolve a path inside the app bundle (works unpacked and in a packaged .app). */
const appPath = (...parts: string[]): string => join(app.getAppPath(), ...parts);

/** Pending `select-serial-port` callback awaiting the renderer's choice. */
let pendingPortCallback: ((portId: string) => void) | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1140,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#0d1117",
    title: "Garage Copilot",
    webPreferences: {
      preload: appPath("dist", "main", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Open external links (e.g. DTC look-ups) in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  const ses = win.webContents.session;

  // Allow the renderer to use the Web Serial API.
  ses.setPermissionCheckHandler((_wc, permission) => permission === "serial");
  ses.setDevicePermissionHandler(details => details.deviceType === "serial");

  // When the renderer calls navigator.serial.requestPort(), Electron asks us to
  // choose. Forward the candidates to the renderer's picker and wait.
  ses.on("select-serial-port", (event, portList, _webContents, callback) => {
    event.preventDefault();
    pendingPortCallback = callback;
    const ports: SerialPortInfo[] = portList.map(p => ({
      portId: p.portId,
      portName: p.portName,
      displayName: p.displayName,
      vendorId: p.vendorId,
      productId: p.productId
    }));
    win.webContents.send(IPC.SerialPorts, ports);
  });

  void win.loadFile(appPath("dist", "renderer", "index.html"));
  return win;
}

ipcMain.on(IPC.SerialChoose, (_event: IpcMainEvent, portId: string) => {
  if (pendingPortCallback) {
    pendingPortCallback(typeof portId === "string" ? portId : "");
    pendingPortCallback = null;
  }
});

ipcMain.handle(IPC.AppInfo, (): AppInfo => ({
  appVersion: app.getVersion(),
  electron: process.versions.electron ?? "",
  chrome: process.versions.chrome ?? "",
  platform: process.platform
}));

/** A standard role-based menu so Cmd+Q/Copy/Paste/Reload behave natively. */
function buildMenu(): Menu {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: "appMenu" }] as MenuItemConstructorOptions[])
      : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    { role: "windowMenu" }
  ];
  return Menu.buildFromTemplate(template);
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
