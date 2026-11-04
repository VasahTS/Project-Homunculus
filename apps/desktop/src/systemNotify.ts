// Homunculus 2 — "Reply ready" as a system notification while the app is in the background (Settings → General, D-082).
// Desktop: the Tauri notification plugin (a Windows toast). Browser preview: the web Notification API. CLAUDE, 2026-11-03.
import { isDesktop } from "./db.ts";
import { getPrefs } from "./prefs.ts";

/** Asks once for permission; true when notifications may be shown. */
export async function askSystemNotifications(): Promise<boolean> {
  try {
    if (isDesktop) {
      const n = await import("@tauri-apps/plugin-notification");
      if (await n.isPermissionGranted()) return true;
      return (await n.requestPermission()) === "granted";
    }
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    return (await Notification.requestPermission()) === "granted";
  } catch { return false; }
}

/** Shows a notification when the setting is on and the window is not in front. Never throws. */
export async function notifyInBackground(title: string, body: string): Promise<void> {
  if (!getPrefs().systemNotify) return;
  if (typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    if (isDesktop) {
      const n = await import("@tauri-apps/plugin-notification");
      if (await n.isPermissionGranted()) n.sendNotification({ title, body });
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { body });
  } catch { /* no notification service */ }
}
