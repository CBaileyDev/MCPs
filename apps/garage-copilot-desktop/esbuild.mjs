// Build script: bundles the Electron main + preload (CommonJS, Node platform)
// and the renderer (ESM, browser platform), then copies static assets. The
// renderer bundles the Garage Copilot engine straight from ../garage-copilot's
// built dist, so all the tested OBD logic is reused as-is.

import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const common = { bundle: true, logLevel: "info", sourcemap: true };

await build({
  ...common,
  entryPoints: ["src/main/main.ts"],
  outfile: "dist/main/main.cjs",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"]
});

await build({
  ...common,
  entryPoints: ["src/main/preload.ts"],
  outfile: "dist/main/preload.cjs",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"]
});

await build({
  ...common,
  entryPoints: ["src/renderer/app.ts"],
  outfile: "dist/renderer/app.js",
  platform: "browser",
  format: "esm",
  target: "es2022",
  // The engine barrel re-exports a Node-only serial transport guarded by a
  // runtime dynamic import; it is never executed in the browser renderer.
  logOverride: { "indirect-dynamic-import": "silent" }
});

mkdirSync("dist/renderer", { recursive: true });
copyFileSync("src/renderer/index.html", "dist/renderer/index.html");
copyFileSync("src/renderer/styles.css", "dist/renderer/styles.css");

console.log("garage-copilot-desktop: build complete");
