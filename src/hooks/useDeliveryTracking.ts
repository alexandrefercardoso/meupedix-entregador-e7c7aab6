import { useEffect, useRef } from "react";

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * While `active` is true, keeps the screen awake (Wake Lock API)
 * and streams GPS positions via watchPosition. Coordinates are cached
 * in localStorage so the last known position survives reloads/offline.
 */
export function useDeliveryTracking(active: boolean, orderId?: string) {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    let cancelled = false;

    const acquireWakeLock = async () => {
      try {
        const wl = (navigator as unknown as {
          wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> };
        }).wakeLock;
        if (!wl) return;
        const sentinel = await wl.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        wakeLockRef.current = sentinel;
      } catch (err) {
        console.warn("[tracking] wake lock failed", err);
      }
    };
    acquireWakeLock();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    if ("geolocation" in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const payload = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            ts: Date.now(),
            orderId: orderId ?? null,
          };
          try {
            localStorage.setItem("meupedix_last_position", JSON.stringify(payload));
          } catch { /* ignore */ }
        },
        (err) => console.warn("[tracking] geolocation error", err),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [active, orderId]);
}