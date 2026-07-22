import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchDriverDeliveredByDateRange,
  type DeliveryOrder,
  type DeliveryOrderItem,
} from "@/lib/orders";
import {
  formatAddress,
  formatBRL,
  formatOrderNumber,
  formatTimeSP,
} from "@/lib/format";

export const Route = createFileRoute("/_app/historico")({
  ssr: false,
  component: HistoricoPage,
});

type OrderWithItems = DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] };

// Today in America/Sao_Paulo as YYYY-MM-DD
function todaySP(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA yields YYYY-MM-DD
}

// Convert a YYYY-MM-DD (interpreted in SP) + time to a UTC ISO string.
// SP is UTC-3 with no DST, so YYYY-MM-DDTHH:mm:ss-03:00 works.
function spDateToISO(date: string, time: "start" | "end"): string {
  const t = time === "start" ? "00:00:00" : "23:59:59";
  return new Date(`${date}T${t}-03:00`).toISOString();
}

function HistoricoPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const driverId = profile?.id;

  const [startDate, setStartDate] = useState<string>(todaySP());
  const [endDate, setEndDate] = useState<string>(todaySP());

  const ordersQuery = useQuery({
    queryKey: ["driver-delivered-range", driverId, startDate, endDate],
    queryFn: () =>
      fetchDriverDeliveredByDateRange(
        driverId!,
        spDateToISO(startDate, "start"),
        spDateToISO(endDate, "end"),
      ),
    enabled: !!driverId && !!startDate && !!endDate,
  });

  const orders = (ordersQuery.data?.orders ?? []) as OrderWithItems[];
  const sessions = ordersQuery.data?.sessions ?? [];
  const total = orders.reduce((acc, o) => acc + Number(o.total_amount ?? 0), 0);
  const fees = orders.reduce((acc, o) => acc + Number(o.delivery_fee ?? 0), 0);

  const refetchAll = () => {
    ordersQuery.refetch();
  };

  const isLoading = ordersQuery.isLoading;
  const isFetching = ordersQuery.isFetching;

  return (
    <div className="mx-auto max-w-lg">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Histórico</h1>
          <p className="text-xs text-muted-foreground">
            {sessions.length > 0
              ? `${sessions.length} caixa(s) no período`
              : "Nenhum caixa no período"}
          </p>
        </div>
        <Button size="icon" variant="outline" onClick={refetchAll} disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </header>

      <div className="space-y-3 p-4">
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 p-3">
            <div className="space-y-1">
              <Label htmlFor="start-date" className="text-xs text-muted-foreground">
                Início
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end-date" className="text-xs text-muted-foreground">
                Fim
              </Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
          </div>
        )}

        {!isLoading && orders.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 opacity-50" />
              <p className="text-sm">Nenhuma entrega concluída no período.</p>
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