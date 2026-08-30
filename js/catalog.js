// ============================================================
// CATÁLOGO PÚBLICO, NAVEGACIÓN Y TICKET DE SEGUIMIENTO
// ============================================================

let currentProduct = null;
let allProducts = [];
let selectedCategory = "Todas";
let pendingPaymentUrl = "";

const DEFAULT_CATEGORIES = [
  "Todas",
  "Motos y Vehículos",
  "Equipos Eléctricos",
  "Electrodomésticos",
  "Alimentos",
  "Ferretería y Más",
  "General"
];

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

// -------- Generador de clave master aleatoria --------
function generateSecretKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// -------- Navegación entre vistas --------
function showView(viewId) {
  document.querySelectorAll(".view-screen").forEach((el) => {
    el.style.display = el.id === viewId ? "block" : "none";
  });
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
    grid.innerHTML = `<div class="empty-state">No se pudo cargar el catálogo. Verifica la configuración de Supabase.</div>`;
    console.error(error);
    return;
  }

  allProducts = data || [];
  renderCategories();
  renderFilteredProducts();
}

// -------- Renderizar botones de categoría (pills) --------
function renderCategories() {
  const container = document.getElementById("categoryPillsContainer");
  if (!container) return;

  const customCategories = allProducts.map((p) => p.category || "General");
  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories]));

  container.innerHTML = "";
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = `btn btn-secondary category-pill ${selectedCategory === cat ? "active" : ""}`;
    btn.style.fontSize = "12px";
    btn.style.padding = "4px 10px";
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      selectedCategory = cat;
      renderCategories();
      renderFilteredProducts();
    });
    container.appendChild(btn);
  });
}

// -------- Filtrar y renderizar productos --------
function renderFilteredProducts() {
  const grid = document.getElementById("productGrid");
  const searchTerm = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();

  let filtered = allProducts;

  if (selectedCategory !== "Todas") {
    filtered = filtered.filter((p) => (p.category || "General") === selectedCategory);
  }

  if (searchTerm) {
    filtered = filtered.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(searchTerm) ||
        (p.description || "").toLowerCase().includes(searchTerm) ||
        (p.category || "").toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">No se encontraron productos para esta búsqueda o categoría.</div>`;
    return;
  }

  grid.innerHTML = "";
  filtered.forEach((p) => {
    const card = document.createElement("div");
    card.className = "product-card glass";
    card.innerHTML = `
      ${p.image_url
        ? `<img class="product-img" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}">`
        : `<div class="product-img"></div>`}
      <div class="product-info">
        <span class="badge" style="font-size:10px; margin-bottom:4px; display:inline-block;">${escapeHtml(p.category || "General")}</span>
        <p class="product-name">${escapeHtml(p.name)}</p>
        <p class="product-price">$${Number(p.price).toFixed(2)} ${escapeHtml(p.currency || "USD")}</p>
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
  document.getElementById("productPrice").textContent = `$${Number(product.price).toFixed(2)} ${product.currency || "USD"}`;
  document.getElementById("productDesc").textContent = product.description || "";
  document.getElementById("buyerName").value = "";
  document.getElementById("buyerContact").value = "";
  document.getElementById("buyerDestination").value = "";
  document.getElementById("orderResult").textContent = "";

  document.getElementById("checkoutFormStep").style.display = "block";
  document.getElementById("ticketGeneratedStep").style.display = "none";

  toggleOverlay("productOverlay", true);
}

// -------- Creación de pedido y generación de Ticket (ID + Master Key) --------
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
  btn.textContent = "Creando Ticket y pago…";

  const referralCode = localStorage.getItem("referral_code") || null;
  const accessKey = generateSecretKey();

  try {
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
        access_key: accessKey,
        status: "pending",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const { data, error: fnError } = await supabaseClient.functions.invoke("create-invoice", {
      body: {
        order_id: order.id,
        product_id: currentProduct.id,
        description: `${currentProduct.name} — pedido ${order.id.slice(0, 8)}`,
      },
    });

    if (fnError) throw fnError;
    if (!data?.url) throw new Error(data?.error || "La pasarela de Nexapay no devolvió un enlace.");

    if (data.invoice_id) {
      await supabaseClient
        .from("orders")
        .update({ nexapay_invoice_id: data.invoice_id })
        .eq("id", order.id);
    }

    pendingPaymentUrl = data.url;

    // Mostrar Ticket generado
    document.getElementById("ticketDisplayId").textContent = order.id;
    document.getElementById("ticketDisplayKey").textContent = accessKey;

    document.getElementById("checkoutFormStep").style.display = "none";
    document.getElementById("ticketGeneratedStep").style.display = "block";

  } catch (err) {
    console.error(err);
    resultEl.textContent =
      "No se pudo procesar la solicitud. Verifica que Supabase y Nexapay estén configurados.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Pagar con tarjeta (Nexapay)";
  }
}

// -------- Consultar Ticket de Pedido --------
async function lookupOrderTicket() {
  const orderIdInput = document.getElementById("lookupOrderId").value.trim();
  const accessKeyInput = document.getElementById("lookupAccessKey").value.trim();
  const msg = document.getElementById("lookupMsg");
  const resContainer = document.getElementById("ticketResultContainer");

  msg.textContent = "";
  resContainer.style.display = "none";

  if (!orderIdInput || !accessKeyInput) {
    msg.textContent = "Ingresa tanto el ID de Pedido como tu Clave Master.";
    return;
  }

  msg.textContent = "Buscando pedido…";

  // Buscar por ID completo o fragmento inicial y clave de acceso
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("access_key", accessKeyInput);

  if (error) {
    msg.textContent = "Error al consultar la base de datos.";
    return;
  }

  const match = (data || []).find(
    (o) => o.id === orderIdInput || o.id.startsWith(orderIdInput)
  );

  if (!match) {
    msg.textContent = "No se encontró ningún pedido con esa combinación de ID y Clave Master.";
    return;
  }

  msg.textContent = "";
  document.getElementById("resProductName").textContent = match.product_name;
  document.getElementById("resAmount").textContent = Number(match.amount).toFixed(2);
  document.getElementById("resDestination").textContent = match.shipping_destination;

  const statusEl = document.getElementById("resStatus");
  statusEl.textContent = match.status.toUpperCase();
  statusEl.className = `pill ${match.status === "paid" ? "paid" : "pending"}`;

  document.getElementById("resDate").textContent = `Fecha: ${new Date(match.created_at).toLocaleString('es-ES')}`;
  resContainer.style.display = "block";
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

  // Navegación
  document.getElementById("goCatalogBtn")?.addEventListener("click", () => showView("view-catalog"));
  document.getElementById("backToHomeBtn")?.addEventListener("click", () => showView("view-landing"));

  // Modales Ticket
  document.getElementById("goCheckTicketBtn")?.addEventListener("click", () => toggleOverlay("ticketLookupOverlay", true));
  document.getElementById("checkTicketSmallBtn")?.addEventListener("click", () => toggleOverlay("ticketLookupOverlay", true));
  document.getElementById("doLookupBtn")?.addEventListener("click", lookupOrderTicket);

  document.getElementById("proceedToNexapayBtn")?.addEventListener("click", () => {
    if (pendingPaymentUrl) {
      window.location.href = pendingPaymentUrl;
    }
  });

  // Toggle categorías
  document.getElementById("toggleCategoryBtn")?.addEventListener("click", () => {
    const panel = document.getElementById("categoryExpandablePanel");
    if (panel) {
      const isHidden = panel.style.display === "none";
      panel.style.display = isHidden ? "block" : "none";
      document.getElementById("toggleCategoryBtn").textContent = isHidden ? "📁 Categorías ▲" : "📁 Categorías ▼";
    }
  });

  document.getElementById("searchInput")?.addEventListener("input", renderFilteredProducts);
  document.getElementById("payBtn")?.addEventListener("click", submitOrder);

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => toggleOverlay(btn.dataset.close, false));
  });
});
