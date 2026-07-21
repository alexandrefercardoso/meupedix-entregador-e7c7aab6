import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchCurrentCashierSession,
  fetchDriverDeliveredBySession,
  type DeliveryOrder,
  type DeliveryOrderItem,
} from "@/lib/orders";
import {
  formatAddress,
  formatBRL,
  formatDateTimeSP,
  formatOrderNumber,
  formatTimeSP,
} from "@/lib/format";

export const Route = createFileRoute("/_app/historico")({
  ssr: false,
  component: HistoricoPage,
});

type OrderWithItems = DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] };

function HistoricoPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const driverId = profile?.id;

  const sessionQuery = useQuery({
    queryKey: ["cashier-current"],
    queryFn: fetchCurrentCashierSession,
  });

  const sessionId = sessionQuery.data?.id;

  const ordersQuery = useQuery({
    queryKey: ["driver-delivered", driverId, sessionId],
    queryFn: () => fetchDriverDeliveredBySession(driverId!, sessionId!),
    enabled: !!driverId && !!sessionId,
  });

  const orders = (ordersQuery.data ?? []) as OrderWithItems[];
  const total = orders.reduce((acc, o) => acc + Number(o.total_amount ?? 0), 0);
  const fees = orders.reduce((acc, o) => acc + Number(o.delivery_fee ?? 0), 0);

  const refetchAll = () => {
    sessionQuery.refetch();
    ordersQuery.refetch();
  };

  const isLoading = sessionQuery.isLoading || ordersQuery.isLoading;
  const isFetching = sessionQuery.isFetching || ordersQuery.isFetching;

  return (
    <div className="mx-auto max-w-lg">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Histórico</h1>
          <p className="text-xs text-muted-foreground">
            {sessionQuery.data
              ? `Caixa aberto em ${formatDateTimeSP(sessionQuery.data.opened_at)}${sessionQuery.data.status !== "open" ? " (fechado)" : ""}`
              : "Nenhum caixa encontrado"}
          </p>
        </div>
        <Button size="icon" variant="outline" onClick={refetchAll} disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </header>

      <div className="space-y-3 p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
          </div>
        )}

        {!isLoading && !sessionQuery.data && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhum caixa aberto no momento.
            </CardContent>
          </Card>
        )}

        {!isLoading && sessionQuery.data && orders.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 opacity-50" />
              <p className="text-sm">Nenhuma entrega concluída neste caixa.</p>
            </CardContent>
          </Card>
        )}

        {orders.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="grid grid-cols-3 gap-2 p-3 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Entregas</div>
                <div className="text-lg font-bold text-foreground">{orders.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Taxas</div>
                <div className="text-lg font-bold text-foreground">{formatBRL(fees)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-lg font-bold text-foreground">{formatBRL(total)}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {orders.map((o) => (
          <Card
            key={o.id}
            onClick={() => navigate({ to: "/pedido/$id", params: { id: o.id } })}
            className="cursor-pointer transition-all active:scale-[0.99]"
          >
            <CardContent className="p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Comanda</div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatOrderNumber(o.id)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Entregue
                  </span>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatTimeSP(o.delivered_at)}
                  </div>
                </div>
              </div>
              <p className="mb-1 text-sm text-foreground">{formatAddress(o)}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{o.payment_method ?? "—"}</span>
                <span className="font-semibold text-foreground">
                  {formatBRL(o.total_amount)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}