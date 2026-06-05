/**
 * Electron main process — deliberately tiny.
 *
 * All OBD logic lives in the renderer (it talks to the dongle over the Web Serial
 * API). Main only: creates the window, enables Web Serial, and drives the native
 * serial-port picker by forwarding Electron's `select-serial-port` list to the
 * renderer and relaying the user's choice back. No native serial module, so
 * nothing to rebuild against Electron's ABI.
 */

import { app, BrowserWindow, ipcMain, Menu, session, shell, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { IPC, type AppInfo, type HistoryRecord, type SerialPortInfo } from "../shared/ipc.js";
import { isAllowedExternalUrl, isTrustedFrameUrl } from "./url-allowlist.js";

/**
 * Content Security Policy applied as a response header (defense in depth beyond
 * the <meta> in index.html). The renderer loads only its own bundle; the single
 * outbound exception is the opt-in VIN lookup, which contacts NHTSA's public
 * vPIC API. 'unsafe-inline' is kept for styles only, which the UI relies on.
 */
const CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self'; " +
  "connect-src https://vpic.nhtsa.dot.gov; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'none'";

/** Reject IPC from any frame that is not our bundled (file://) renderer. */
function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return isTrustedFrameUrl(event.senderFrame?.url);
}

const HISTORY_CAP = 100;
const historyFile = (): string => join(app.getPath("userData"), "garage-copilot-history.json");

async function readHistory(): Promise<HistoryRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(historyFile(), "utf8"));
    return Array.isArray(parsed) ? (parsed as HistoryRecord[]) : [];
  } catch {
    // Missing or corrupt file → start fresh.
    return [];
  }
}

async function writeHistory(records: HistoryRecord[]): Promise<void> {
  const file = historyFile();
  await mkdir(app.getPath("userData"), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(records), "utf8");
  await rename(tmp, file); // atomic replace
}

/** Resolve a path inside the app bundle (works unpacked and in a packaged .app). */
const appPath = (...parts: string[]): string => join(app.getAppPath(), ...parts);

/** Pending `select-serial-port` callback awaiting the renderer's choice. */
let pendingPortCallback: ((portId: string) => void) | null = null;

/**
 * One-time hardening of the default session: attach the CSP response header and
 * lock permissions down to Web Serial only (the app's single capability).
 */
function hardenDefaultSession(): void {
  const ses = session.defaultSession;
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] }
    });
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === "serial");
  // Web Serial is granted via the check + device handlers below; every other
  // permission request (notifications, media, geolocation, …) is denied.
  ses.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  ses.setDevicePermissionHandler(details => details.deviceType === "serial");
}

// Navigation hardening, registered once for every web contents the app creates.
app.on("web-contents-created", (_event, contents) => {
  // Keep the renderer pinned to the bundled app; never let it navigate or be
  // redirected to a remote origin (a classic XSS-to-takeover lever).
  const blockOffApp = (event: Electron.Event, url: string): void => {
    let isLocal = false;
    try {
      isLocal = new URL(url).protocol === "file:";
    } catch {
      isLocal = false;
    }
    if (!isLocal) event.preventDefault();
  };
  contents.on("will-navigate", blockOffApp);
  contents.on("will-redirect", blockOffApp);

  // External links (e.g. DTC look-ups) open in the OS browser — and only if they
  // pass the strict allowlist. The window itself never opens a child window.
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
});

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
      sandbox: true,
      // Defaults already, but pinned explicitly so a future Electron default
      // change can't silently weaken the renderer's isolation.
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  });

  const ses = win.webContents.session;

  // When the renderer calls navigator.serial.requestPort(), Electron asks us to
  // choose. Forward the candidates to the renderer's picker and wait.
  ses.on("select-serial-port", (event, portList, _webContents, callback) => {
    event.preventDefault();
    // Release any earlier pending request that was never resolved (e.g. the user
    // clicked Connect twice) so its requestPort() promise doesn't hang forever.
    if (pendingPortCallback) pendingPortCallback("");
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

ipcMain.on(IPC.SerialChoose, (event: IpcMainEvent, portId: string) => {
  if (!isTrustedSender(event)) return;
  if (pendingPortCallback) {
    pendingPortCallback(typeof portId === "string" ? portId : "");
    pendingPortCallback = null;
  }
});

ipcMain.handle(IPC.HistoryList, (event): Promise<HistoryRecord[]> => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  return readHistory();
});

ipcMain.handle(IPC.HistorySave, async (event, record: HistoryRecord): Promise<HistoryRecord[]> => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  const records = await readHistory();
  records.unshift(record); // newest first
  const capped = records.slice(0, HISTORY_CAP);
  await writeHistory(capped);
  return capped;
});

ipcMain.handle(IPC.HistoryClear, async (event): Promise<void> => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  await writeHistory([]);
});

ipcMain.handle(IPC.AppInfo, (event): AppInfo => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  return {
    appVersion: app.getVersion(),
    electron: process.versions.electron ?? "",
    chrome: process.versions.chrome ?? "",
    platform: process.platform
  };
});

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
  hardenDefaultSession();
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
