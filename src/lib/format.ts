export function formatOrderNumber(id: string | null | undefined): string {
  if (!id) return "---";
  const clean = String(id).replace(/-/g, "");
  return clean.slice(-3).toUpperCase();
}

export function formatBRL(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatTimeSP(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "--:--";
  }
}

export function formatDateTimeSP(iso: string | null | undefined): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "--";
  }
}

export function formatAddress(o: {
  customer_address?: string | null;
  neighborhood?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_cep?: string | null;
}): string {
  const parts: string[] = [];
  if (o.customer_address) parts.push(o.customer_address);
  if (o.neighborhood) parts.push(o.neighborhood);
  if (o.customer_city) {
    parts.push(o.customer_state ? `${o.customer_city}/${o.customer_state}` : o.customer_city);
  }
  return parts.filter(Boolean).join(" - ");
}