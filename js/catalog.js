// ============================================================
// CATÁLOGO PÚBLICO
// ============================================================

let currentProduct = null;

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

// -------- Captura de referido desde el link (?ref=CODE) --------
function captureReferral() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref) {
    localStorage.setItem("referral_code", ref);
  }
  return localStorage.getItem("referral_code") || null;
}

// -------- Cargar productos activos --------
async function loadProducts() {
  const grid = document.getElementById("productGrid");
  grid.innerHTML = `<div class="empty-state">Cargando catálogo…</div>`;

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = `<div class="empty-state">No se pudo cargar el catálogo. Verifica la configuración de Supabase en js/config.js.</div>`;
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state">Todavía no hay productos publicados. El administrador puede agregarlos desde el panel.</div>`;
    return;
  }

  grid.innerHTML = "";
  data.forEach((p) => {
    const card = document.createElement("div");
    card.className = "product-card glass";
    card.innerHTML = `
      ${p.image_url
        ? `<img class="product-img" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}">`
        : `<div class="product-img"></div>`}
      <div class="product-info">
        <p class="product-name">${escapeHtml(p.name)}</p>
        <p class="product-price">$${Number(p.price).toFixed(2)} ${escapeHtml(p.currency)}</p>
      </div>`;
    card.addEventListener("click", () => openProductSheet(p));
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// -------- Ficha de producto / compra --------
function openProductSheet(product) {
  currentProduct = product;
  document.getElementById("productTitle").textContent = product.name;
  document.getElementById("productPrice").textContent = `$${Number(product.price).toFixed(2)} ${product.currency}`;
  document.getElementById("productDesc").textContent = product.description || "";
  document.getElementById("buyerName").value = "";
  document.getElementById("buyerContact").value = "";
  document.getElementById("buyerDestination").value = "";
  document.getElementById("orderResult").textContent = "";
  toggleOverlay("productOverlay", true);
}

async function submitOrder() {
  const name = document.getElementById("buyerName").value.trim();
  const contact = document.getElementById("buyerContact").value.trim();
  const destination = document.getElementById("buyerDestination").value.trim();
  const resultEl = document.getElementById("orderResult");
  const btn = document.getElementById("payBtn");

  if (!name || !contact || !destination) {
    resultEl.textContent = "Completa tus datos y el destino en Cuba para continuar.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Generando pago en Nexapay…";

  const referralCode = localStorage.getItem("referral_code") || null;

  try {
    // 1) Registrar el pedido en Supabase (estado: pending)
    const { data: order, error: orderError } = await supabaseClient
      .from("orders")
      .insert({
        product_id: currentProduct.id,
        product_name: currentProduct.name,
        amount: currentProduct.price,
        buyer_name: name,
        buyer_contact: contact,
        shipping_destination: destination,
        referral_code: referralCode,
        status: "pending",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 2) Pedir a la Edge Function que valide el precio real del servidor y genere el enlace de pago con Nexapay.
    const { data, error: fnError } = await supabaseClient.functions.invoke("create-invoice", {
      body: {
        order_id: order.id,
        product_id: currentProduct.id,
        description: `${currentProduct.name} — pedido ${order.id.slice(0, 8)}`,
      },
    });

    if (fnError) throw fnError;
    if (!data?.url) throw new Error(data?.error || "La pasarela de Nexapay no devolvió un enlace.");

    // 3) Guardar el id de factura de Nexapay en el pedido
    if (data.invoice_id) {
      await supabaseClient
        .from("orders")
        .update({ nexapay_invoice_id: data.invoice_id })
        .eq("id", order.id);
    }

    // 4) Llevar al comprador a pagar con su tarjeta en Nexapay
    window.location.href = data.url;
  } catch (err) {
    console.error(err);
    resultEl.textContent =
      "No se pudo generar el pago. Revisa que la función create-invoice de Supabase esté configurada con tus llaves de Nexapay (NEXAPAY_API_KEY).";
    btn.disabled = false;
    btn.textContent = "Pagar con tarjeta";
  }
}

function toggleOverlay(id, open) {
  const el = document.getElementById(id);
  if (open) el.classList.add("open");
  else el.classList.remove("open");
}

// -------- Init --------
document.addEventListener("DOMContentLoaded", () => {
  captureReferral();
  loadProducts();

  document.getElementById("payBtn").addEventListener("click", submitOrder);
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => toggleOverlay(btn.dataset.close, false));
  });
});
