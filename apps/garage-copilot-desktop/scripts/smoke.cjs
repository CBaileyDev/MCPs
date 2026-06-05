/**
 * Headless boot smoke test. Launches the real Electron app, drives the renderer
 * (Demo connect + a diagnostic scan) via executeJavaScript, and asserts the UI
 * actually wired up and produced results. Run with:
 *   xvfb-run -a electron scripts/smoke.cjs
 * Exits 0 on success, non-zero on any failure — usable in CI without a display.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const { join } = require("node:path");

const root = join(__dirname, "..");
const failures = [];

// Stub the app-info channel the renderer's About tab calls (the real main.ts
// registers this; the smoke harness provides its own minimal main).
ipcMain.handle("app:info", () => ({
  appVersion: "smoke",
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform
}));

// In-memory history store (the real main.ts persists to disk).
let history = [];
ipcMain.handle("history:list", () => history);
ipcMain.handle("history:save", (_e, record) => {
  history.unshift(record);
  return history;
});
ipcMain.handle("history:clear", () => {
  history = [];
});

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: join(root, "dist", "main", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const ses = win.webContents.session;
    ses.setPermissionCheckHandler((_wc, permission) => permission === "serial");
    ses.setDevicePermissionHandler(details => details.deviceType === "serial");

    win.webContents.on("render-process-gone", (_e, details) => failures.push("render-process-gone: " + details.reason));
    win.webContents.on("preload-error", (_e, path, error) => failures.push("preload-error: " + error.message));

    await win.loadFile(join(root, "dist", "renderer", "index.html"));

    const result = await win.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const errors = [];
      window.addEventListener('error', (e) => errors.push(String(e.message)));

      // 1) Demo connect.
      document.getElementById('btn-demo').click();
      await sleep(900);
      const pill = document.getElementById('status-pill');

      // 2) Run a diagnostic scan.
      document.getElementById('btn-scan').click();
      await sleep(900);
      const scanText = document.getElementById('diagnose-output').textContent || '';

      // 3) Switch to Tune tab and assess a final-drive change.
      document.querySelector('[data-tab="tune"]').click();
      document.getElementById('btn-fd').click();
      await sleep(100);
      const fdText = document.getElementById('result-fd').textContent || '';

      // 4) History: the scan auto-saves; open the tab and confirm it shows.
      document.querySelector('[data-tab="history"]').click();
      await sleep(300);
      const historyText = document.getElementById('history-list').textContent || '';

      return {
        pill: pill.textContent,
        pillClass: pill.className,
        scanHasMisfire: scanText.includes('P0301'),
        scanHasCat: scanText.includes('P0420'),
        scanHasVin: scanText.includes('1HGBH41JXMN109186'),
        scanHasRpm: /Engine RPM/.test(scanText),
        fdHasRpm: fdText.includes('2480') || /RPM/i.test(fdText),
        historyHasEntry: /MIL ON|DTC/.test(historyText),
        errors
      };
    })()`);

    console.log("SMOKE_RESULT=" + JSON.stringify(result));

    if (!/Demo/.test(result.pill) || !result.pillClass.includes("pill--on")) {
      failures.push("Demo connect did not reach connected state: " + result.pill);
    }
    if (!result.scanHasMisfire || !result.scanHasCat) failures.push("Scan output missing DTC codes");
    if (!result.scanHasVin) failures.push("Scan output missing VIN");
    if (!result.scanHasRpm) failures.push("Scan output missing live RPM");
    if (!result.fdHasRpm) failures.push("Tune advisor produced no result");
    if (!result.historyHasEntry) failures.push("History did not record the scan");
    if (Array.isArray(result.errors) && result.errors.length) failures.push("renderer errors: " + result.errors.join("; "));

    if (failures.length) {
      console.error("SMOKE_FAIL\n" + failures.join("\n"));
      app.exit(1);
    } else {
      console.log("SMOKE_OK");
      app.exit(0);
    }
  })
  .catch(err => {
    console.error("SMOKE_EXCEPTION", err && err.stack ? err.stack : err);
    app.exit(2);
  });
