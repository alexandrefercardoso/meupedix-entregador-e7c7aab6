import { supabase } from "@/integrations/supabase/client";

export type DeliveryOrder = {
  id: string;
  status: string | null;
  driver_status: string | null;
  driver_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_cep: string | null;
  neighborhood: string | null;
  observation: string | null;
  notes: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_fee: number | null;
  total_amount: number | null;
  payment_method: string | null;
  created_at: string | null;
  delivery_started_at: string | null;
  delivered_at: string | null;
};

export type DeliveryOrderItem = {
  id: string;
  order_id: string;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  notes: string | null;
  selected_complements: unknown;
};

export const ORDER_COLUMNS =
  "id, status, driver_status, driver_id, customer_name, customer_phone, customer_address, customer_city, customer_state, customer_cep, neighborhood, observation, notes, delivery_lat, delivery_lng, delivery_fee, total_amount, payment_method, created_at, delivery_started_at, delivered_at";

export async function fetchDriverOrders(driverId: string) {
  const { data, error } = await supabase
    .from("delivery_orders")
    .select(
      `${ORDER_COLUMNS}, delivery_order_items ( id, order_id, product_name, quantity, unit_price, total_price, notes, selected_complements )`,
    )
    .eq("driver_id", driverId)
    .in("driver_status", ["aguardando", "a_caminho"])
    .not("status", "in", "(delivered,cancelled)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as (DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] })[];
}

export async function fetchOrderById(id: string) {
  const { data, error } = await supabase
    .from("delivery_orders")
    .select(
      `${ORDER_COLUMNS}, delivery_order_items ( id, order_id, product_name, quantity, unit_price, total_price, notes, selected_complements )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as (DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] }) | null;
}

export type StoreLocation = { latitude: number | null; longitude: number | null };

export async function fetchStoreLocation(): Promise<StoreLocation | null> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("latitude, longitude")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as StoreLocation) ?? null;
}

export async function startDelivery(id: string) {
  const { error } = await supabase
    .from("delivery_orders")
    .update({
      driver_status: "a_caminho",
      delivery_started_at: new Date().toISOString(),
      status: "delivering",
    })
    .eq("id", id);
  if (error) throw error;
}

export async function confirmDelivered(id: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("delivery_orders")
    .update({
      driver_status: "entregue",
      delivered_at: now,
      status: "awaiting_reconciliation",
    })
    .eq("id", id);
  if (error) throw error;
}

export async function persistGeocode(id: string, lat: number, lng: number) {
  await supabase
    .from("delivery_orders")
    .update({ delivery_lat: lat, delivery_lng: lng })
    .eq("id", id);
}

export type CashierSession = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  status: string | null;
};

export async function fetchCurrentCashierSession(): Promise<CashierSession | null> {
  // Prefer the open session; fall back to the most recent one.
  const { data: open, error: openErr } = await supabase
    .from("cashier_sessions")
    .select("id, opened_at, closed_at, status")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openErr) throw openErr;
  if (open) return open as CashierSession;
  const { data: last, error: lastErr } = await supabase
    .from("cashier_sessions")
    .select("id, opened_at, closed_at, status")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw lastErr;
  return (last as CashierSession) ?? null;
}

export async function fetchDriverDeliveredBySession(driverId: string, sessionId: string) {
  const { data, error } = await supabase
    .from("delivery_orders")
    .select(
      `${ORDER_COLUMNS}, delivery_order_items ( id, order_id, product_name, quantity, unit_price, total_price, notes, selected_complements )`,
    )
    .eq("driver_id", driverId)
    .eq("cashier_session_id", sessionId)
    .eq("driver_status", "entregue")
    .order("delivered_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as (DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] })[];
}

export async function fetchDriverDeliveredByDateRange(
  driverId: string,
  startISO: string,
  endISO: string,
) {
  // Get cashier sessions opened within the range
  const { data: sessions, error: sErr } = await supabase
    .from("cashier_sessions")
    .select("id, opened_at, closed_at, status")
    .gte("opened_at", startISO)
    .lte("opened_at", endISO)
    .order("opened_at", { ascending: false });
  if (sErr) throw sErr;
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
  if (sessionIds.length === 0) {
    return {
      sessions: [] as CashierSession[],
      orders: [] as (DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] })[],
    };
  }
  const { data, error } = await supabase
    .from("delivery_orders")
    .select(
      `${ORDER_COLUMNS}, delivery_order_items ( id, order_id, product_name, quantity, unit_price, total_price, notes, selected_complements )`,
    )
    .eq("driver_id", driverId)
    .in("cashier_session_id", sessionIds)
    .eq("driver_status", "entregue")
    .order("delivered_at", { ascending: false });
  if (error) throw error;
  return {
    sessions: (sessions ?? []) as CashierSession[],
    orders: (data ?? []) as unknown as (DeliveryOrder & {
      delivery_order_items: DeliveryOrderItem[];
    })[],
  };
}