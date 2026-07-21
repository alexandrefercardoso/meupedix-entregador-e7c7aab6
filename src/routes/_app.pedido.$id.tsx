import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MapPin, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  confirmDelivered,
  fetchOrderById,
  fetchStoreLocation,
  persistGeocode,
  startDelivery,
} from "@/lib/orders";
import {
  formatAddress,
  formatBRL,
  formatDateTimeSP,
  formatOrderNumber,
} from "@/lib/format";

export const Route = createFileRoute("/_app/pedido/$id")({
  ssr: false,
  component: PedidoDetalhes,
});

function PedidoDetalhes() {
  const limparEndereco = (endereco: string) => {
    if (!endereco) return "";
    const partes = endereco.split(" - ").map((p) => p.trim()).filter(Boolean);
    const vistos = new Set<string>();
    const unicas = partes.filter((p) => {
      const k = p.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    return unicas.join(" - ");
  };
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: order, isLoading, isError, refetch } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrderById(id),
  });
  const { data: store } = useQuery({
    queryKey: ["store-location"],
    queryFn: fetchStoreLocation,
  });
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !order) {
    return (
      <div className="p-4 text-center text-sm text-destructive">Pedido não encontrado.</div>
    );
  }

  const phoneDigits = (order.customer_phone ?? "").replace(/\D/g, "");

  const abrirRota = async () => {
    const fromLat = store?.latitude;
    const fromLng = store?.longitude;
    if (fromLat == null || fromLng == null) {
      toast.error("Loja sem coordenadas cadastradas", {
        description: "Cadastre latitude e longitude da loja no painel administrativo.",
      });
      return;
    }
    const address = limparEndereco(formatAddress(order));
    console.log("[abrirRota] Dados do cliente:", {
      id: order.id,
      nome: order.customer_name,
      endereco: address,
      delivery_lat: order.delivery_lat,
      delivery_lng: order.delivery_lng,
      cep: order.customer_cep,
    });
    let toLat = order.delivery_lat;
    let toLng = order.delivery_lng;
    if (toLat == null || toLng == null) {
      if (!address) {
        toast.error(`Cliente ${order.customer_name ?? ""} sem endereço cadastrado`, {
          description: "Cadastre o endereço completo do cliente no painel administrativo.",
        });
        return;
      }
      const t = toast.loading("Localizando endereço...");
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address + ", Brasil")}`,
          { headers: { Accept: "application/json" } },
        );
        const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
        if (!arr?.length) {
          toast.dismiss(t);
          toast.warning("Coordenadas do cliente não encontradas", {
            description: `${order.customer_name ?? "Cliente"} — ${address}. Abrindo rota pelo endereço no Google Maps. Cadastre as coordenadas no painel para maior precisão.`,
          });
          const fallback = `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${encodeURIComponent(address + ", Brasil")}&travelmode=driving`;
          window.open(fallback, "_blank", "noopener,noreferrer");
          return;
        }
        toLat = Number(arr[0].lat);
        toLng = Number(arr[0].lon);
        persistGeocode(order.id, toLat, toLng).catch(() => {});
        toast.dismiss(t);
      } catch (err) {
        toast.dismiss(t);
        console.error(err);
        toast.warning("Erro ao localizar endereço", {
          description: `Abrindo rota pelo endereço no Google Maps: ${address}`,
        });
        const fallback = `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${encodeURIComponent(address + ", Brasil")}&travelmode=driving`;
        window.open(fallback, "_blank", "noopener,noreferrer");
        return;
      }
    }
    const url = `https://www.openstreetmap.org/directions?from=${fromLat},${fromLng}&to=${toLat},${toLng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      await startDelivery(order.id);
      toast.success("Entrega iniciada");
      await refetch();
    } catch (err) {
      toast.error("Erro ao iniciar");
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await confirmDelivered(order.id);
      toast.success("Entrega confirmada");
      setConfirmOpen(false);
      navigate({ to: "/pedidos" });
    } catch (err) {
      toast.error("Erro ao confirmar");
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/pedidos" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="text-xs text-muted-foreground">Comanda</div>
          <div className="text-lg font-bold leading-none">
            {formatOrderNumber(order.id)}
          </div>
        </div>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          {formatDateTimeSP(order.created_at)}
        </div>
      </header>

      <div className="space-y-3 p-4 pb-32">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <div className="text-xs text-muted-foreground">Cliente</div>
              <div className="font-medium text-foreground">{order.customer_name ?? "—"}</div>
              {order.customer_phone && (
                <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
              )}
            </div>
            {order.customer_phone && (
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <a href={`tel:${phoneDigits}`}>
                    <Phone className="mr-1 h-4 w-4" /> Ligar
                  </a>
                </Button>
                <Button asChild size="sm" className="flex-1 bg-green-600 hover:bg-green-700">
                  <a
                    href={`https://wa.me/${phoneDigits}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Endereço de entrega</div>
            <p className="mt-1 text-sm text-foreground">{limparEndereco(formatAddress(order))}</p>
            {order.observation && (
              <p className="mt-1 text-xs text-muted-foreground">Obs: {order.observation}</p>
            )}
            {order.customer_cep && (
              <p className="mt-1 text-xs text-muted-foreground">CEP: {order.customer_cep}</p>
            )}
            {store?.latitude != null && store?.longitude != null ? (
              <Button
                type="button"
                size="sm"
                className="mt-3 w-full"
                onClick={abrirRota}
              >
                <MapPin className="mr-1 h-4 w-4" /> 🗺️ Abrir Rota
              </Button>
            ) : (
              <p className="mt-3 text-xs text-destructive">
                Cadastre as coordenadas da loja no painel para habilitar a rota.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-xs text-muted-foreground">Itens</div>
            <ul className="space-y-2">
              {order.delivery_order_items?.map((it) => (
                <li key={it.id} className="text-sm">
                  <div className="font-medium text-foreground">
                    {it.quantity ?? 1}x {it.product_name}
                  </div>
                  {it.notes && (
                    <div className="text-xs text-muted-foreground">{it.notes}</div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <Row
              label="Subtotal"
              value={formatBRL((order.total_amount ?? 0) - (order.delivery_fee ?? 0))}
            />
            <Row label="Taxa de entrega" value={formatBRL(order.delivery_fee)} />
            <Separator className="my-2" />
            <Row label="Total" value={formatBRL(order.total_amount)} bold />
            <Row label="Pagamento" value={order.payment_method ?? "—"} />
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          {order.driver_status === "aguardando" && (
            <Button className="w-full bg-green-600 hover:bg-green-700" disabled={busy} onClick={handleStart}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "▶ Iniciar Entrega"}
            </Button>
          )}
          {order.driver_status === "a_caminho" && (
            <Button
              variant="secondary"
              className="w-full border border-accent bg-accent/10 text-accent-foreground hover:bg-accent/20"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              ✅ Finalizar Entrega
            </Button>
          )}
          {order.driver_status === "entregue" && (
            <div className="text-center text-sm font-medium text-green-600">Pedido entregue</div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar entrega?</AlertDialogTitle>
            <AlertDialogDescription>
              Pedido {formatOrderNumber(order.id)} será marcado como entregue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-bold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}