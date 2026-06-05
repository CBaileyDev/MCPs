/**
 * Generate the app icon (build/icon.png, 1024x1024) by drawing it on a canvas in
 * a renderer and exporting the PNG. Uses Electron (already a dev dep) so no image
 * tooling is required. Run: xvfb-run -a electron scripts/make-icon.cjs
 */

const { app, BrowserWindow } = require("electron");
const { join } = require("node:path");
const { mkdirSync, writeFileSync } = require("node:fs");

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({ show: false, width: 256, height: 256 });
    await win.loadURL("data:text/html,<body></body>");

    const dataUrl = await win.webContents.executeJavaScript(`(() => {
      const S = 1024;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const x = c.getContext('2d');

      // Rounded-square background with a subtle vertical gradient.
      const r = 200;
      const g = x.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, '#11305a');
      g.addColorStop(1, '#0d1117');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(r, 0); x.arcTo(S, 0, S, S, r); x.arcTo(S, S, 0, S, r);
      x.arcTo(0, S, 0, 0, r); x.arcTo(0, 0, S, 0, r); x.closePath(); x.fill();

      // Gauge.
      const cx = S/2, cy = S/2 + 40, rad = 300;
      const start = Math.PI * 0.75, end = Math.PI * 2.25; // 270deg sweep
      x.lineCap = 'round';

      x.strokeStyle = '#2a3340';
      x.lineWidth = 70;
      x.beginPath(); x.arc(cx, cy, rad, start, end); x.stroke();

      const val = start + (end - start) * 0.68;
      x.strokeStyle = '#2f81f7';
      x.lineWidth = 70;
      x.beginPath(); x.arc(cx, cy, rad, start, val); x.stroke();

      // Needle.
      x.strokeStyle = '#e6edf3';
      x.lineWidth = 26;
      x.beginPath();
      x.moveTo(cx, cy);
      x.lineTo(cx + Math.cos(val) * (rad - 30), cy + Math.sin(val) * (rad - 30));
      x.stroke();

      // Hub.
      x.fillStyle = '#e6edf3';
      x.beginPath(); x.arc(cx, cy, 46, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#2f81f7';
      x.beginPath(); x.arc(cx, cy, 22, 0, Math.PI * 2); x.fill();

      return c.toDataURL('image/png');
    })()`);

    const png = Buffer.from(dataUrl.split(",")[1], "base64");
    mkdirSync(join(__dirname, "..", "build"), { recursive: true });
    writeFileSync(join(__dirname, "..", "build", "icon.png"), png);
    console.log("wrote build/icon.png", png.length, "bytes");
    app.exit(0);
  })
  .catch(err => {
    console.error("ICON_EXCEPTION", err && err.stack ? err.stack : err);
    app.exit(2);
  });
