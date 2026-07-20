import { supabase } from "@/integrations/supabase/client";

export type DeliveryOrder = {
  id: string;
  order_number: number | string | null;
  status: string | null;
  driver_status: string | null;
  driver_id: string | null;
  store_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_street: string | null;
  delivery_number: string | null;
  delivery_neighborhood: string | null;
  delivery_complement: string | null;
  delivery_city: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  subtotal: number | null;
  delivery_fee: number | null;
  discount: number | null;
  total: number | null;
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
  notes: string | null;
};

export const ORDER_COLUMNS =
  "id, order_number, status, driver_status, driver_id, store_id, customer_name, customer_phone, delivery_address, delivery_street, delivery_number, delivery_neighborhood, delivery_complement, delivery_city, delivery_lat, delivery_lng, subtotal, delivery_fee, discount, total, payment_method, created_at, delivery_started_at, delivered_at";

export async function fetchDriverOrders(driverId: string) {
  const { data, error } = await supabase
    .from("delivery_orders")
    .select(
      `${ORDER_COLUMNS}, delivery_order_items ( id, order_id, product_name, quantity, notes )`,
    )
    .eq("driver_id", driverId)
    .in("driver_status", ["aguardando", "a_caminho"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as (DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] })[];
}

export async function fetchOrderById(id: string) {
  const { data, error } = await supabase
    .from("delivery_orders")
    .select(
      `${ORDER_COLUMNS}, delivery_order_items ( id, order_id, product_name, quantity, notes )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as (DeliveryOrder & { delivery_order_items: DeliveryOrderItem[] }) | null;
}

export async function startDelivery(id: string) {
  const { error } = await supabase
    .from("delivery_orders")
    .update({ driver_status: "a_caminho", delivery_started_at: new Date().toISOString() })
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
      status: "delivered",
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