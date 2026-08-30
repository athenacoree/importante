// ============================================================
// Edge Function: create-invoice (Nexapay Integration)
// Recibe order_id y product_id. Busca el precio real actualizado
// directamente en la base de datos de Supabase para evitar
// manipulaciones en el cliente. Luego genera la factura de cobro
// en Nexapay (permite cobro con tarjeta y saldo/retiro en cripto).
//
// Variables de entorno necesarias en Supabase (Secrets):
//   NEXAPAY_API_KEY          = Tu API Key de Nexapay
//   NEXAPAY_SECRET           = Tu API Secret de Nexapay (opcional)
//   SUPABASE_URL             = (Inyectado automáticamente por Supabase)
//   SUPABASE_SERVICE_ROLE_KEY= Key de servicio para saltarse RLS en servidor
// ============================================================

// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const NEXAPAY_API_KEY = Deno.env.get("NEXAPAY_API_KEY") ?? Deno.env.get("NEXAPAY_APP_ID") ?? "";
const NEXAPAY_SECRET = Deno.env.get("NEXAPAY_SECRET") ?? Deno.env.get("NEXAPAY_APP_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id, product_id, description } = await req.json();

    if (!order_id || !product_id) {
      return new Response(
        JSON.stringify({ error: "Faltan datos requeridos (order_id y product_id)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Usar la clave de service role para consultar y actualizar el pedido de forma privilegiada en el servidor
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: product, error: prodError } = await supabase
      .from("products")
      .select("id, name, price, currency, active")
      .eq("id", product_id)
      .single();

    if (prodError || !product) {
      return new Response(
        JSON.stringify({ error: "Producto no encontrado en el catálogo" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!product.active) {
      return new Response(
        JSON.stringify({ error: "El producto seleccionado ya no está activo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const realPrice = Number(product.price);

    // Actualizar el pedido en la BD con el monto oficial
    await supabase
      .from("orders")
      .update({ amount: realPrice, product_name: product.name })
      .eq("id", order_id);

    if (!NEXAPAY_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "NEXAPAY_API_KEY no está configurada en los secrets de Supabase.",
          message: "El administrador debe agregar NEXAPAY_API_KEY en Supabase > Edge Functions > Secrets."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentPayload = {
      amount: realPrice,
      currency: product.currency || "USD",
      description: description || `${product.name} — Pedido ${order_id.slice(0, 8)}`,
      order_id: order_id,
      product_id: product.id,
      callback_url: `${SUPABASE_URL}/functions/v1/nexapay-webhook`,
    };

    const nexapayRes = await fetch("https://api.nexapay.io/v1/invoices", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NEXAPAY_API_KEY}`,
        "X-NEXAPAY-SECRET": NEXAPAY_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paymentPayload),
    });

    const nexapayData = await nexapayRes.json();

    if (!nexapayRes.ok || !nexapayData?.url) {
      const checkoutUrl = nexapayData?.checkout_url || nexapayData?.url || nexapayData?.payment_url;
      const invoiceId = nexapayData?.invoice_id || nexapayData?.id || nexapayData?.transaction_id;

      if (checkoutUrl) {
        return new Response(
          JSON.stringify({ url: checkoutUrl, invoice_id: invoiceId || null, amount: realPrice }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: "Error al comunicarse con la pasarela de Nexapay",
          details: nexapayData
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        url: nexapayData.url,
        invoice_id: nexapayData.invoice_id || nexapayData.id || null,
        amount: realPrice
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
