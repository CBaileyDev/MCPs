import type { GarageBridge } from "../main/preload.js";

declare global {
  interface Window {
    /** The preload bridge exposed via contextBridge. */
    garage: GarageBridge;
  }
}

export {};
