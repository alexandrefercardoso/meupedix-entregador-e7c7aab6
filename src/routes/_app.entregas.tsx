import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { fetchDriverOrders, persistGeocode, type DeliveryOrder, type DeliveryOrderItem } from "@/lib/orders";
import { formatAddress, formatOrderNumber } from "@/lib/format";

export const Route = createFileRoute("/_app/entregas")({
  ssr: false,
  component: EntregasPage,
});

type OrderWithItems = DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] };

let mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(attempt = 0): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;

  const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const trackingId = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!browserKey) return Promise.reject(new Error("Google Maps browser key missing"));

  // Remove any previous script tag from a failed attempt so we get a fresh load.
  document
    .querySelectorAll('script[data-meupedix-gmaps="1"]')
    .forEach((n) => n.parentNode?.removeChild(n));

  mapsPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${browserKey}&loading=async${trackingId ? `&channel=${trackingId}` : ""}`;
    s.async = true;
    s.defer = true;
    s.setAttribute("data-meupedix-gmaps", "1");
    // No global callback — use the script's load event directly. Global
    // callbacks frequently get lost on mobile due to bundling/PWA ordering.
    s.addEventListener("load", () => {
      // With loading=async we still need to wait for the maps library.
      const start = Date.now();
      const check = () => {
        if (window.google?.maps?.Map) { resolve(); return; }
        if (Date.now() - start > 8000) { reject(new Error("Google Maps não inicializou")); return; }
        setTimeout(check, 50);
      };
      check();
    });
    s.addEventListener("error", () => reject(new Error("Falha ao baixar Google Maps")));
    document.head.appendChild(s);
  }).catch((err) => {
    mapsPromise = null;
    if (attempt < 2) {
      return new Promise<void>((r) => setTimeout(r, 1000)).then(() => loadGoogleMaps(attempt + 1));
    }
    throw err;
  });
  return mapsPromise;
}

function EntregasPage() {
  const { profile } = useAuth();
  const driverId = profile?.id;
  const navigate = useNavigate();

  // Keep the screen awake while the driver is looking at the map.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const wl = (() => {
      try {
        return (navigator as unknown as {
          wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
        }).wakeLock;
      } catch { return undefined; }
    })();
    if (!wl || typeof wl.request !== "function") return;
    const acquire = async () => {
      try {
        const s = await wl.request("screen");
        if (cancelled) { s.release().catch(() => {}); return; }
        sentinel = s;
      } catch { /* ignore — iOS Safari or permission-blocked */ }
    };
    acquire();
    const onVis = () => {
      try {
        if (document.visibilityState === "visible" && !sentinel) acquire();
      } catch { /* ignore */ }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      try { sentinel?.release().catch(() => {}); } catch { /* ignore */ }
      sentinel = null;
    };
  }, []);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["driver-orders", driverId],
    queryFn: () => fetchDriverOrders(driverId!),
    enabled: !!driverId,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderWithItems | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Initialize map once — but only after the container actually has a
  // measurable size. On mobile the layout can settle a frame or two after
  // mount; creating the map inside a 0-height container produces a blank
  // white screen because Google Maps never renders tiles.
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    const init = async () => {
      setMapError(null);
      try {
        await loadGoogleMaps();
      } catch (e) {
        if (!cancelled) setMapError((e as Error).message);
        return;
      }
      if (cancelled) return;

      const waitForSize = () =>
        new Promise<void>((resolve) => {
          const check = () => {
            const el = containerRef.current;
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          if (check()) { resolve(); return; }
          let tries = 0;
          const tick = () => {
            if (cancelled) { resolve(); return; }
            if (check() || tries++ > 60) { resolve(); return; }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });

      await waitForSize();
      if (cancelled || !containerRef.current) return;

      try {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: -23.5505, lng: -46.6333 },
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        infoRef.current = new google.maps.InfoWindow();
        setMapReady(true);

        // Trigger resize whenever the container size changes so tiles
        // paint correctly after the mobile layout settles or on rotation.
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          ro = new ResizeObserver(() => {
            if (!mapRef.current) return;
            try {
              google.maps.event.trigger(mapRef.current, "resize");
            } catch { /* ignore */ }
          });
          ro.observe(containerRef.current);
        }
        setTimeout(() => {
          if (cancelled || !mapRef.current) return;
          try { google.maps.event.trigger(mapRef.current, "resize"); } catch { /* ignore */ }
        }, 250);
      } catch (e) {
        if (!cancelled) setMapError((e as Error).message);
      }
    };

    init();
    return () => {
      cancelled = true;
      ro?.disconnect();
      ro = null;
    };
  }, [retryTick]);

  // Render markers whenever orders or map change
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    // clear
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const orders = (data ?? []) as OrderWithItems[];
    const bounds = new google.maps.LatLngBounds();
    let placed = 0;

    orders.forEach(async (o) => {
      let lat = o.delivery_lat ?? null;
      let lng = o.delivery_lng ?? null;
      if ((lat == null || lng == null) && formatAddress(o)) {
        try {
          const geocoder = new google.maps.Geocoder();
          const res = await geocoder.geocode({ address: formatAddress(o) });
          if (res.results[0]) {
            lat = res.results[0].geometry.location.lat();
            lng = res.results[0].geometry.location.lng();
            persistGeocode(o.id, lat, lng).catch(() => {});
          }
        } catch {
          return;
        }
      }
      if (lat == null || lng == null) return;

      const color = o.driver_status === "a_caminho" ? "#22c55e" : "#EF4444";
      const label = formatOrderNumber(o.id);
      const marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        label: { text: label, color: "#fff", fontWeight: "bold", fontSize: "11px" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => setSelected(o));
      markersRef.current.push(marker);
      bounds.extend({ lat, lng });
      placed++;
      const lat2 = lat as number;
      const lng2 = lng as number;
      bounds.extend({ lat: lat2, lng: lng2 });
      if (placed === orders.length) {
        if (placed === 1) {
          map.setCenter(bounds.getCenter());
          map.setZoom(15);
        } else if (placed > 1) {
          map.fitBounds(bounds, 60);
        }
      }
    });
  }, [data, mapReady]);

  const recenter = () => {
    try {
      if (!navigator.geolocation || !mapRef.current) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            mapRef.current!.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            mapRef.current!.setZoom(15);
          } catch { /* ignore */ }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } catch { /* ignore */ }
  };

  return (
    <div className="relative mx-auto max-w-lg">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Entregas</h1>
          <p className="text-xs text-muted-foreground">
            {(data ?? []).length} no mapa
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="icon" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Button size="icon" variant="outline" onClick={recenter}>
            <LocateFixed className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div
        className="relative w-full overflow-hidden"
        style={{
          // vh fallback first, then dvh where supported. min-height guarantees
          // the container is never 0 (which is what causes the blank/gray map
          // "Ops! Algo deu errado" screen on mobile).
          height: "calc(100vh - 8.5rem)",
          minHeight: "300px",
        }}
      >
        <style>{`.meupedix-map-wrap{height:calc(100dvh - 8.5rem);}`}</style>
        {(isLoading || !mapReady) && !mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar o mapa.
            </p>
            <Button
              onClick={() => {
                mapsPromise = null;
                setMapError(null);
                setMapReady(false);
                setRetryTick((t) => t + 1);
              }}
            >
              Tentar novamente
            </Button>
          </div>
        )}
        {/* touch-action:none must live ONLY on the map itself so the
            surrounding UI (info card, buttons) stays interactive. */}
        <div
          ref={containerRef}
          className="meupedix-map-wrap h-full w-full"
          style={{ touchAction: "none" }}
        />

        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-20">
            <Card>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Comanda</div>
                    <div className="text-xl font-bold">
                      {formatOrderNumber(selected.id)}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                    Fechar
                  </Button>
                </div>
                <p className="text-sm text-foreground">{formatAddress(selected)}</p>
                <Button
                  className="w-full"
                  onClick={() =>
                    navigate({ to: "/pedido/$id", params: { id: selected.id } })
                  }
                >
                  Ver detalhes
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}