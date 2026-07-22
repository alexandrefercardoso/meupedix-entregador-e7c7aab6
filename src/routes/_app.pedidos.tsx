import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  confirmDelivered,
  fetchDriverOrders,
  startDelivery,
  type DeliveryOrder,
  type DeliveryOrderItem,
} from "@/lib/orders";
import { formatAddress, formatOrderNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const CACHE_KEY = "meupedix_last_orders_v1";

export const Route = createFileRoute("/_app/pedidos")({
  ssr: false,
  component: PedidosPage,
});

type OrderWithItems = DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] };

function PedidosPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const driverId = profile?.id;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["driver-orders", driverId],
    queryFn: () => fetchDriverOrders(driverId!),
    enabled: !!driverId,
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        return raw ? (JSON.parse(raw) as OrderWithItems[]) : undefined;
      } catch {
        return undefined;
      }
    },
  });

  // Persist last successful list so it renders instantly (and offline).
  useEffect(() => {
    if (!data) return;
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch { /* ignore quota */ }
  }, [data]);

  // Ask notification permission once so we can alert the driver about new orders.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Track known order IDs to detect newly assigned orders and notify.
  const knownIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((o) => o.id));
    if (knownIdsRef.current) {
      const fresh = data.filter((o) => !knownIdsRef.current!.has(o.id));
      for (const o of fresh) {
        const title = `Novo pedido — ${formatOrderNumber(o.id)}`;
        const body = o.customer_name
          ? `${o.customer_name} • ${formatAddress(o)}`
          : formatAddress(o);
        toast.info(title, { description: body });
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(title, { body, icon: "/pwa-512.png", tag: o.id });
          } catch { /* ignore */ }
        }
      }
    }
    knownIdsRef.current = ids;
  }, [data]);

  useEffect(() => {
    if (!driverId) return;
    const channel = supabase
      .channel(`driver-orders-${driverId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_orders", filter: `driver_id=eq.${driverId}` },
        () => qc.invalidateQueries({ queryKey: ["driver-orders", driverId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, qc]);

  const [justDelivered, setJustDelivered] = useState<Set<string>>(new Set());
  const orders = useMemo(() => data ?? [], [data]);
  const aguardando = useMemo(
    () => orders.filter((o) => o.driver_status === "aguardando"),
    [orders],
  );
  const aCaminho = useMemo(
    () => orders.filter((o) => o.driver_status === "a_caminho"),
    [orders],
  );

  const markDelivered = (id: string) => {
    setJustDelivered((prev) => new Set(prev).add(id));
    setTimeout(() => refetch(), 2500);
  };

  return (
    <div className="mx-auto max-w-lg">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold text-foreground">Pedidos</h1>
        <p className="text-xs text-muted-foreground">
          {orders.length} {orders.length === 1 ? "pedido ativo" : "pedidos ativos"}
        </p>
      </header>

      <div className="space-y-3 p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando pedidos...
          </div>
        )}
        {isError && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-destructive">
              Erro ao carregar pedidos.
              <Button variant="link" onClick={() => refetch()}>Tentar novamente</Button>
            </CardContent>
          </Card>
        )}
        {!isLoading && !isError && orders.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 opacity-50" />
              <p className="text-sm">Nenhum pedido ativo no momento.</p>
            </CardContent>
          </Card>
        )}
        {aguardando.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aguardando Início ({aguardando.length})
            </h2>
            {aguardando.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                highlighted={justDelivered.has(o.id)}
                onDelivered={markDelivered}
              />
            ))}
          </section>
        )}
        {aCaminho.length > 0 && (
          <section className="space-y-2 pt-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Em Andamento ({aCaminho.length})
            </h2>
            {aCaminho.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                highlighted={justDelivered.has(o.id)}
                onDelivered={markDelivered}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  highlighted,
  onDelivered,
}: {
  order: OrderWithItems;
  highlighted: boolean;
  onDelivered: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = order.driver_status;

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await startDelivery(order.id);
      toast.success("Entrega iniciada com sucesso!");
    } catch (err) {
      toast.error("Não foi possível iniciar");
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
      onDelivered(order.id);
    } catch (err) {
      toast.error("Não foi possível confirmar");
      console.error(err);
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Card
        onClick={() => navigate({ to: "/pedido/$id", params: { id: order.id } })}
        className={cn(
          "cursor-pointer transition-all active:scale-[0.99]",
          highlighted && "border-green-500 bg-green-50",
        )}
      >
        <CardContent className="p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Comanda</div>
              <div className="text-2xl font-bold text-foreground">
                {formatOrderNumber(order.id)}
              </div>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                status === "a_caminho"
                  ? "bg-accent/20 text-accent-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {status === "a_caminho" ? "A caminho" : "Aguardando"}
            </span>
          </div>

          {order.customer_name && (
            <p className="text-sm font-semibold text-foreground">{order.customer_name}</p>
          )}
          <p className="mb-2 text-sm text-muted-foreground">{formatAddress(order)}</p>
          <ul className="mb-3 space-y-0.5 text-xs text-muted-foreground">
            {order.delivery_order_items?.slice(0, 4).map((it) => (
              <li key={it.id}>
                {String(it.quantity ?? 1).padStart(2, "0")} - {it.product_name}
              </li>
            ))}
            {(order.delivery_order_items?.length ?? 0) > 4 && (
              <li>+ {order.delivery_order_items.length - 4} item(s)</li>
            )}
          </ul>

          {status === "aguardando" && (
            <Button className="w-full bg-green-600 hover:bg-green-700" disabled={busy} onClick={handleStart}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "▶ Iniciar Entrega"}
            </Button>
          )}
          {status === "a_caminho" && (
            <Button
              className="w-full"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                navigate({ to: "/pedido/$id", params: { id: order.id } });
              }}
            >
              📍 Acompanhar Entrega
            </Button>
          )}
        </CardContent>
      </Card>

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
    </>
  );
}