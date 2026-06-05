/**
 * electron-builder `afterPack` hook: flip Electron security fuses on the packaged
 * binary so the shipped app can't be coerced into running as a generic Node
 * process or opened to a debugger.
 *
 * The fuse set here is deliberately conservative so it stays safe for the
 * unsigned local build (`identity: null`): it does NOT enable ASAR integrity
 * validation or OnlyLoadAppFromAsar, which require code signing to launch.
 * `resetAdHocDarwinSignature` re-seals the macOS binary after the bytes change.
 *
 * Requires the `@electron/fuses` devDependency (`npm install`). Only runs during
 * `npm run dist`; it does not affect typecheck, tests, or the esbuild bundle.
 */
const path = require("node:path");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

const APP_EXT = { darwin: ".app", win32: ".exe", linux: "" };

exports.default = async function configureFuses(context) {
  const { electronPlatformName, appOutDir } = context;
  const productFilename = context.packager.appInfo.productFilename;
  const ext = APP_EXT[electronPlatformName] ?? "";
  const electronBinary = path.join(appOutDir, `${productFilename}${ext}`);

  await flipFuses(electronBinary, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === "darwin",
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true
  });

  console.log(`[fuses] hardened ${path.basename(electronBinary)} (${electronPlatformName})`);
};
