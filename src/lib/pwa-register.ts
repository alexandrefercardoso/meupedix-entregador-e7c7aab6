// Guarded PWA service worker registration.
// Never registers in dev, iframe, or Lovable preview hosts.
// Emits `meupedix:sw-update-available` when a new SW is waiting, so the UI
// can prompt the user to activate it. Also flushes offline queue on load.

const APP_SW_URL = "/sw.js";
export const SW_UPDATE_EVENT = "meupedix:sw-update-available";

let waitingWorker: ServiceWorker | null = null;

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.top !== window.self) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  if (new URLSearchParams(window.location.search).has("sw") &&
      new URLSearchParams(window.location.search).get("sw") === "off") {
    return true;
  }
  return false;
}

async function unregisterAppSW() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => {
        const url =
          r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        return url.endsWith(APP_SW_URL);
      })
      .map((r) => r.unregister()),
  );
}

function trackWaiting(reg: ServiceWorkerRegistration) {
  const notify = (w: ServiceWorker | null) => {
    if (!w) return;
    waitingWorker = w;
    window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
  };
  if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        notify(reg.waiting ?? installing);
      }
    });
  });
}

export function applyPWAUpdate() {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

export async function registerPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (isRefusedContext()) {
    await unregisterAppSW();
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register(APP_SW_URL, { scope: "/" });
    trackWaiting(reg);
    // Poll for updates every 60 min in case the driver keeps the app open.
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  } catch (err) {
    console.warn("[pwa] SW registration failed", err);
  }
}