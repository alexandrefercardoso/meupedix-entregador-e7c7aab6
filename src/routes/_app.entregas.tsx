import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { fetchDriverOrders, persistGeocode, type DeliveryOrder, type DeliveryOrderItem } from "@/lib/orders";
import { formatAddress, formatOrderNumber } from "@/lib/format";
import L from "leaflet";

export const Route = createFileRoute("/_app/entregas")({
  ssr: false,
  component: EntregasPage,
});

type OrderWithItems = DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] };

// Teardrop pin — mesmo padrão da Central de Despacho.
// Gota com borda preta de 2px, sombra suave e os 3 últimos dígitos do pedido
// em branco, bold 10px, centralizados no bulbo. Altura 30px (28px mobile via CSS).
function buildPinIcon(label: string, color: string, pulse = false): L.DivIcon {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 34 46">
  <defs>
    <filter id="s" x="-30%" y="-20%" width="160%" height="140%">
      <feDropShadow dx="0.5" dy="1.5" stdDeviation="1.4" flood-opacity="0.4"/>
    </filter>
  </defs>
  <path filter="url(#s)" d="M17 1.5c-7.7 0-14 6.1-14 13.6 0 10.2 14 29.4 14 29.4s14-19.2 14-29.4c0-7.5-6.3-13.6-14-13.6z"
    fill="${color}" stroke="#000" stroke-width="2"/>
  <text x="17" y="20" text-anchor="middle" dominant-baseline="middle"
    font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    font-size="14" font-weight="800" fill="#fff" letter-spacing="-0.5">${label}</text>
</svg>`.trim();
  return L.divIcon({
    className: `meupedix-pin${pulse ? " meupedix-pin-pulse" : ""}`,
    html: svg,
    iconSize: [22, 30],
    iconAnchor: [11, 29],
    popupAnchor: [0, -28],
  });
}

// Motoqueiro — círculo azul-claro pulsante com ícone de moto branco e borda branca grossa.
function buildDriverIcon(): L.DivIcon {
  const html = `
<div class="meupedix-driver-wrap">
  <span class="meupedix-driver-pulse"></span>
  <span class="meupedix-driver-dot">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none"
      stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/>
      <circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M15 6h3l2 5"/>
      <path d="M5.5 17.5 9 11h6l3 6.5"/>
    </svg>
  </span>
</div>`.trim();
  return L.divIcon({
    className: "meupedix-driver",
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Mapeamento de cores idêntico à Central de Despacho.
function pinColorFor(o: OrderWithItems): string {
  if (o.driver_status === "a_caminho") return "#22c55e"; // verde — em rota
  if (o.driver_status === "aguardando") return "#3b82f6"; // azul — novo p/ entregador
  const src = String((o as unknown as { source?: string; order_source?: string }).source
    ?? (o as unknown as { order_source?: string }).order_source ?? "").toLowerCase();
  if (src.includes("ifood") || src.includes("whats") || src.includes("delivery")) return "#eab308"; // amarelo
  return "#EF4444"; // vermelho — balcão/manual
}

// Nominatim (OSM) geocoder — free, no key. Rate-limited so we serialize.
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!arr[0]) return null;
    return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
  } catch {
    return null;
  }
}

// Nudge markers apart so overlapping pins remain individually clickable.
function spreadOverlaps(points: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  const seen = new Map<string, number>();
  return points.map((p) => {
    const key = `${p.lat.toFixed(5)}|${p.lng.toFixed(5)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return p;
    const angle = (n * 60 * Math.PI) / 180;
    const r = 0.00012 * Math.ceil(n / 6);
    return { lat: p.lat + Math.sin(angle) * r, lng: p.lng + Math.cos(angle) * r };
  });
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
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<OrderWithItems | null>(null);

  // Initialize Leaflet map once the container has a measurable size.
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;

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
          if (check() || tries++ > 120) { resolve(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

    (async () => {
      await waitForSize();
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [-23.5505, -46.6333],
        zoom: 13,
        zoomControl: false,
        attributionControl: true,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
        crossOrigin: true,
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);

      // Redraw tiles whenever the container size changes (mobile rotation,
      // keyboard, address-bar collapse). Prevents any grey/blank state.
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => {
          try { map.invalidateSize(); } catch { /* ignore */ }
        });
        ro.observe(containerRef.current);
      }
      setTimeout(() => { try { map.invalidateSize(); } catch { /* ignore */ } }, 250);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      ro = null;
      try { mapRef.current?.remove(); } catch { /* ignore */ }
      mapRef.current = null;
      markersRef.current = new Map();
      driverMarkerRef.current = null;
    };
  }, []);

  // Render markers whenever orders or map change
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;

    // Clear previous
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = new Map();

    const orders = (data ?? []) as OrderWithItems[];

    (async () => {
      const resolved: { order: OrderWithItems; lat: number; lng: number }[] = [];
      for (const o of orders) {
        if (cancelled) return;
        let lat = o.delivery_lat ?? null;
        let lng = o.delivery_lng ?? null;
        if ((lat == null || lng == null) && formatAddress(o)) {
          const g = await geocodeAddress(formatAddress(o));
          if (g) {
            lat = g.lat;
            lng = g.lng;
            persistGeocode(o.id, lat, lng).catch(() => {});
          }
        }
        if (lat == null || lng == null) continue;
        resolved.push({ order: o, lat, lng });
      }
      if (cancelled) return;

      const spread = spreadOverlaps(resolved.map((r) => ({ lat: r.lat, lng: r.lng })));

      resolved.forEach((r, i) => {
        const p = spread[i];
        const color = pinColorFor(r.order);
        const label = formatOrderNumber(r.order.id);
        const marker = L.marker([p.lat, p.lng], { icon: buildPinIcon(label, color) }).addTo(map);
        marker.on("click", () => {
          setSelected(r.order);
          try {
            marker.setIcon(buildPinIcon(label, color, true));
            window.setTimeout(() => {
              try { marker.setIcon(buildPinIcon(label, color, false)); } catch { /* ignore */ }
            }, 2000);
          } catch { /* ignore */ }
        });
        markersRef.current.set(r.order.id, marker);
      });

      if (resolved.length === 1) {
        map.setView([resolved[0].lat, resolved[0].lng], 15);
      } else if (resolved.length > 1) {
        const b = L.latLngBounds(resolved.map((r) => [r.lat, r.lng] as [number, number]));
        map.fitBounds(b, { padding: [60, 60] });
      }
    })();

    return () => { cancelled = true; };
  }, [data, mapReady]);

  // Driver's live position — refresh every 10s while on this screen.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let stopped = false;

    const update = () => {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (stopped || !mapRef.current) return;
            const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            if (!driverMarkerRef.current) {
              driverMarkerRef.current = L.marker(ll, { icon: buildDriverIcon(), zIndexOffset: 1000 }).addTo(mapRef.current);
            } else {
              driverMarkerRef.current.setLatLng(ll);
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
        );
      } catch { /* ignore */ }
    };
    update();
    const id = window.setInterval(update, 10_000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [mapReady]);

  const recenter = () => {
    try {
      if (!navigator.geolocation || !mapRef.current) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            mapRef.current!.setView([pos.coords.latitude, pos.coords.longitude], 15);
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
          height: "calc(100vh - 8.5rem)",
          minHeight: "300px",
        }}
      >
        <style>{`.meupedix-map-wrap{height:calc(100dvh - 8.5rem);}`}</style>
        {(isLoading || !mapReady) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div
          ref={containerRef}
          className="meupedix-map-wrap h-full w-full"
          style={{ touchAction: "pan-x pan-y" }}
        />

        {/* Legenda discreta — idêntica à Central de Despacho */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-md border border-border/60 bg-background/90 px-2 py-1.5 shadow-sm backdrop-blur">
          <ul className="space-y-0.5 text-[11px] leading-tight text-foreground">
            <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#3b82f6" }} />Novo</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#22c55e" }} />Em rota</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#eab308" }} />Delivery</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#EF4444" }} />Balcão</li>
          </ul>
        </div>

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