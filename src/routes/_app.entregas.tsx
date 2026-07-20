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

declare global {
  interface Window {
    initMeupedixMap?: () => void;
  }
}

let mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const trackingId = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!browserKey) {
      reject(new Error("Google Maps browser key missing"));
      return;
    }
    window.initMeupedixMap = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${browserKey}&loading=async&callback=initMeupedixMap${trackingId ? `&channel=${trackingId}` : ""}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

function EntregasPage() {
  const { user } = useAuth();
  const driverId = user?.id;
  const navigate = useNavigate();

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

  // Initialize map once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: -23.5505, lng: -46.6333 }, // São Paulo fallback
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        infoRef.current = new google.maps.InfoWindow();
        setMapReady(true);
      })
      .catch((e) => setMapError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

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
      const label = formatOrderNumber(o.order_number);
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
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current!.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current!.setZoom(15);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 },
    );
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

      <div className="relative h-[calc(100vh-8.5rem)] w-full">
        {(isLoading || !mapReady) && !mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-destructive">
            Erro ao carregar mapa: {mapError}
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />

        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-20">
            <Card>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Comanda</div>
                    <div className="text-xl font-bold">
                      {formatOrderNumber(selected.order_number)}
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