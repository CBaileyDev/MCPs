/**
 * Sustained-load smoke: run the live monitor for ~24s and confirm the UI stays
 * responsive (low main-thread lag), values keep updating, and no renderer errors
 * occur. Run: xvfb-run -a electron scripts/stress.cjs
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const { join } = require("node:path");

ipcMain.handle("app:info", () => ({
  appVersion: "stress",
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: "linux"
}));

const root = join(__dirname, "..");
const sleep = ms => new Promise(r => setTimeout(r, ms));

app
  .whenReady()
  .then(async () => {
    const fatal = [];
    const win = new BrowserWindow({
      show: false,
      webPreferences: { preload: join(root, "dist", "main", "preload.cjs"), contextIsolation: true, sandbox: true }
    });
    win.webContents.on("render-process-gone", (_e, d) => fatal.push("render-process-gone: " + d.reason));

    await win.loadFile(join(root, "dist", "renderer", "index.html"));

    await win.webContents.executeJavaScript(`
      window.__errors = [];
      window.addEventListener('error', e => window.__errors.push(String(e.message)));
      document.getElementById('btn-demo').click();
      setTimeout(() => {
        document.querySelector('[data-tab="live"]').click();
        document.getElementById('btn-live-start').click();
      }, 400);
    `);

    const lags = [];
    let first = null;
    let last = null;
    let cards = 0;
    for (let i = 0; i < 12; i++) {
      await sleep(2000);
      const r = await win.webContents.executeJavaScript(`(async () => {
        const t0 = performance.now();
        await new Promise(r => setTimeout(r, 0));
        const lag = performance.now() - t0;
        const v = document.querySelector('.live-value');
        return { lag, val: v ? v.textContent : null, errors: window.__errors.length, cards: document.querySelectorAll('.live-card').length };
      })()`);
      lags.push(r.lag);
      if (i === 0) first = r.val;
      last = r.val;
      cards = r.cards;
      if (r.errors > 0) fatal.push("renderer errors: " + r.errors);
    }

    const maxLag = Math.max(...lags);
    console.log(`STRESS maxLag=${Math.round(maxLag)}ms lags=[${lags.map(x => Math.round(x)).join(",")}] cards=${cards} first=${first} last=${last}`);

    if (fatal.length) {
      console.error("STRESS_FAIL\n" + fatal.join("\n"));
      app.exit(1);
    } else if (maxLag >= 150) {
      console.error(`STRESS_FAIL main thread lag too high: ${Math.round(maxLag)}ms`);
      app.exit(1);
    } else if (cards < 5 || first === last) {
      console.error(`STRESS_FAIL live data not updating (cards=${cards}, first=${first}, last=${last})`);
      app.exit(1);
    } else {
      console.log("STRESS_OK");
      app.exit(0);
    }
  })
  .catch(err => {
    console.error("STRESS_EXCEPTION", err && err.stack ? err.stack : err);
    app.exit(2);
  });
