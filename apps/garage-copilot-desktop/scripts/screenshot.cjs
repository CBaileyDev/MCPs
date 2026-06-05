/**
 * Capture PNG screenshots of the running GUI (headless, via xvfb) for the README.
 * Drives the app into each tab with the Demo adapter and saves capturePage()
 * output. Run: xvfb-run -a electron scripts/screenshot.cjs
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const { join } = require("node:path");
const { mkdirSync, writeFileSync } = require("node:fs");

const root = join(__dirname, "..");
const outDir = join(root, "assets", "screenshots");

ipcMain.handle("app:info", () => ({
  appVersion: "0.1.0",
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: "darwin"
}));

let history = [];
ipcMain.handle("history:list", () => history);
ipcMain.handle("history:save", (_e, record) => {
  history.unshift(record);
  return history;
});
ipcMain.handle("history:clear", () => {
  history = [];
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function capture(win, name) {
  await sleep(300);
  const img = await win.webContents.capturePage();
  writeFileSync(join(outDir, name), img.toPNG());
  console.log("saved", name);
}

app
  .whenReady()
  .then(async () => {
    mkdirSync(outDir, { recursive: true });
    const win = new BrowserWindow({
      width: 1140,
      height: 800,
      show: false,
      backgroundColor: "#0d1117",
      webPreferences: {
        preload: join(root, "dist", "main", "preload.cjs"),
        contextIsolation: true,
        sandbox: true
      }
    });
    await win.loadFile(join(root, "dist", "renderer", "index.html"));

    // Connect demo + run a scan, capture Diagnose.
    await win.webContents.executeJavaScript(
      `document.getElementById('btn-demo').click(); new Promise(r=>setTimeout(r,800)).then(()=>document.getElementById('btn-scan').click());`
    );
    await sleep(1400);
    await capture(win, "diagnose.png");

    // Live monitor.
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-tab="live"]').click(); document.getElementById('btn-live-start').click();`
    );
    await sleep(13000); // let the simulated data move so the sparklines have shape
    await capture(win, "live.png");
    await win.webContents.executeJavaScript(`document.getElementById('btn-live-stop').click();`);

    // Tune advisor — fill all three.
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-tab="tune"]').click();
       document.getElementById('btn-fd').click();
       document.getElementById('inj-size').value='440'; document.getElementById('btn-inj').click();
       document.getElementById('btn-load').click();`
    );
    await sleep(400);
    await capture(win, "tune.png");

    // VIN checker — the scan auto-filled the car's VIN; show the offline decode.
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-tab="vin"]').click(); document.getElementById('btn-vin-check').click();`
    );
    await sleep(300);
    await win.webContents.capturePage();
    await sleep(200);
    await capture(win, "vin.png");

    // History — the scan auto-saved; show the saved-scan list + detail.
    await win.webContents.executeJavaScript(`document.querySelector('[data-tab="history"]').click();`);
    await sleep(900);
    // The list fills asynchronously (IPC round-trip), then the detail renders.
    // Prime a throwaway frame so the offscreen compositor paints the inserted
    // rows before the real capture — otherwise they can come out blank.
    await win.webContents.capturePage();
    await sleep(300);
    await capture(win, "history.png");

    app.exit(0);
  })
  .catch(err => {
    console.error("SCREENSHOT_EXCEPTION", err && err.stack ? err.stack : err);
    app.exit(2);
  });
