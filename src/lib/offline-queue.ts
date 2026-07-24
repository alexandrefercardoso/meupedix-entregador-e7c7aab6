// Offline action queue persisted in localStorage. Currently used for
// "confirm delivered" so drivers with no signal can complete a delivery
// and have it sync automatically once online.
import { confirmDelivered } from "@/lib/orders";

type QueuedAction = { kind: "delivered"; orderId: string; at: number };

const KEY = "meupedix_offline_queue_v1";

function read(): QueuedAction[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]") as QueuedAction[];
  } catch {
    return [];
  }
}

function write(q: QueuedAction[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(q));
  } catch { /* ignore */ }
}

export function queueDelivered(orderId: string) {
  const q = read();
  if (q.some((a) => a.kind === "delivered" && a.orderId === orderId)) return;
  q.push({ kind: "delivered", orderId, at: Date.now() });
  write(q);
}

export function pendingCount(): number {
  return read().length;
}

let flushing = false;
export async function flushQueue(): Promise<{ ok: number; fail: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: 0, fail: 0 };
  if (flushing) return { ok: 0, fail: 0 };
  flushing = true;
  let ok = 0;
  let fail = 0;
  try {
    const q = read();
    const remaining: QueuedAction[] = [];
    for (const item of q) {
      try {
        if (item.kind === "delivered") {
          await confirmDelivered(item.orderId);
          ok++;
        }
      } catch (err) {
        console.warn("[offline-queue] retry failed", err);
        remaining.push(item);
        fail++;
      }
    }
    write(remaining);
  } finally {
    flushing = false;
  }
  return { ok, fail };
}

export function initOfflineQueueSync() {
  if (typeof window === "undefined") return;
  const run = () => {
    flushQueue().then(({ ok }) => {
      if (ok > 0) {
        window.dispatchEvent(new CustomEvent("meupedix:queue-flushed", { detail: { ok } }));
      }
    });
  };
  window.addEventListener("online", run);
  // Initial attempt at startup.
  run();
}