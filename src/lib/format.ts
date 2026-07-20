export function formatOrderNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "---";
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  if (Number.isNaN(num)) return String(n);
  return String(num).padStart(3, "0");
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
  delivery_street?: string | null;
  delivery_number?: string | null;
  delivery_neighborhood?: string | null;
  delivery_complement?: string | null;
  delivery_city?: string | null;
  delivery_address?: string | null;
}): string {
  const parts: string[] = [];
  if (o.delivery_street) {
    parts.push(o.delivery_street + (o.delivery_number ? `, ${o.delivery_number}` : ""));
  } else if (o.delivery_address) {
    parts.push(o.delivery_address);
  }
  if (o.delivery_neighborhood) parts.push(o.delivery_neighborhood);
  if (o.delivery_city) parts.push(o.delivery_city);
  const base = parts.filter(Boolean).join(" - ");
  return o.delivery_complement ? `${base} (${o.delivery_complement})` : base;
}