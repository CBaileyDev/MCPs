/**
 * electron-builder `afterPack` hook: flip Electron security fuses on the packaged
 * binary so the shipped app can't be coerced into running as a generic Node
 * process or opened to a debugger. Runs once per platform during `npm run dist`.
 *
 * The fuse set is deliberately conservative so it stays safe for the unsigned
 * builds here: it does NOT enable ASAR integrity validation or OnlyLoadAppFromAsar
 * (those need code signing to launch). `resetAdHocDarwinSignature` re-seals the
 * macOS binary after the bytes change.
 *
 * Best-effort by design: if the binary can't be located or the flip fails on a
 * given platform, we warn and continue rather than fail the whole package. The
 * hook does not affect typecheck, tests, or the esbuild bundle.
 *
 * Requires the `@electron/fuses` devDependency.
 */
const path = require("node:path");
const fs = require("node:fs");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

/** Locate the packaged Electron executable to harden, per platform. */
function resolveElectronBinary(context) {
  const { electronPlatformName, appOutDir } = context;
  const productFilename = context.packager.appInfo.productFilename;

  if (electronPlatformName === "darwin" || electronPlatformName === "mas") {
    return path.join(appOutDir, `${productFilename}.app`);
  }

  if (electronPlatformName === "win32") {
    const candidate = path.join(appOutDir, `${productFilename}.exe`);
    if (fs.existsSync(candidate)) return candidate;
    const exe = fs.readdirSync(appOutDir).find(f => f.toLowerCase().endsWith(".exe"));
    return exe ? path.join(appOutDir, exe) : candidate;
  }

  // linux: the executable has no file extension (named after executableName).
  const named = context.packager.executableName || productFilename;
  const candidate = path.join(appOutDir, named);
  if (fs.existsSync(candidate)) return candidate;
  const extensionless = fs
    .readdirSync(appOutDir)
    .filter(f => path.extname(f) === "")
    .map(f => path.join(appOutDir, f))
    .find(p => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });
  return extensionless ?? candidate;
}

exports.default = async function configureFuses(context) {
  try {
    const electronBinary = resolveElectronBinary(context);
    if (!fs.existsSync(electronBinary)) {
      console.warn(`[fuses] skipped — binary not found at ${electronBinary}`);
      return;
    }
    await flipFuses(electronBinary, {
      version: FuseVersion.V1,
      resetAdHocDarwinSignature: context.electronPlatformName === "darwin",
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableCookieEncryption]: true
    });
    console.log(`[fuses] hardened ${path.basename(electronBinary)} (${context.electronPlatformName})`);
  } catch (err) {
    // Hardening is best-effort; never fail packaging over it.
    console.warn(`[fuses] skipped — ${err instanceof Error ? err.message : String(err)}`);
  }
};
