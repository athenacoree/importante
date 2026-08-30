// ============================================================
// CATÁLOGO PÚBLICO Y NAVEGACIÓN
// ============================================================

let currentProduct = null;
let allProducts = [];
let selectedCategory = "Todas";

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

  // Combinar categorías por defecto con cualquier categoría nueva creada en productos
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

  // Filtrar por categoría
  if (selectedCategory !== "Todas") {
    filtered = filtered.filter((p) => (p.category || "General") === selectedCategory);
  }

  // Filtrar por buscador
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

    window.location.href = data.url;
  } catch (err) {
    console.error(err);
    resultEl.textContent =
      "No se pudo generar el pago. Revisa que la función create-invoice de Supabase esté configurada con tus llaves de Nexapay.";
    btn.disabled = false;
    btn.textContent = "Pagar con tarjeta (Nexapay)";
  }
}

function toggleOverlay(id, open) {
  const el = document.getElementById(id);
  if (open) el.classList.add("open");
  else el.classList.remove("open");
}

// -------- Manejo de Autenticación de Usuario Regular --------
function setupAuthEvents() {
  const tabLoginBtn = document.getElementById("tabLoginBtn");
  const tabRegisterBtn = document.getElementById("tabRegisterBtn");
  const loginForm = document.getElementById("userLoginForm");
  const regForm = document.getElementById("userRegisterForm");

  if (tabLoginBtn && tabRegisterBtn) {
    tabLoginBtn.addEventListener("click", () => {
      tabLoginBtn.classList.add("active");
      tabRegisterBtn.classList.remove("active");
      loginForm.style.display = "block";
      regForm.style.display = "none";
    });

    tabRegisterBtn.addEventListener("click", () => {
      tabRegisterBtn.classList.add("active");
      tabLoginBtn.classList.remove("active");
      regForm.style.display = "block";
      loginForm.style.display = "none";
    });
  }

  document.getElementById("doUserLoginBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("userEmail").value.trim();
    const pass = document.getElementById("userPass").value;
    const msg = document.getElementById("userAuthMsg");

    if (!email || !pass) {
      msg.textContent = "Ingresa tu correo y contraseña.";
      return;
    }

    msg.textContent = "Verificando…";
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) {
      msg.textContent = "Error: " + error.message;
      return;
    }
    showToast("¡Sesión iniciada!");
    showView("view-catalog");
  });

  document.getElementById("doUserRegBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("regUserEmail").value.trim();
    const pass = document.getElementById("regUserPass").value;
    const msg = document.getElementById("userAuthMsg");

    if (!email || pass.length < 6) {
      msg.textContent = "Pon un correo y una contraseña de al menos 6 caracteres.";
      return;
    }

    msg.textContent = "Creando cuenta…";
    const { data, error } = await supabaseClient.auth.signUp({ email, password: pass });
    if (error) {
      msg.textContent = "Error: " + error.message;
      return;
    }
    showToast("Cuenta creada con éxito.");
    showView("view-catalog");
  });
}

// -------- Init --------
document.addEventListener("DOMContentLoaded", () => {
  captureReferral();
  loadProducts();
  setupAuthEvents();

  // Botones de navegación
  document.getElementById("goAuthBtn")?.addEventListener("click", () => showView("view-auth"));
  document.getElementById("guestCatalogBtn")?.addEventListener("click", () => showView("view-catalog"));
  document.getElementById("skipAuthBtn")?.addEventListener("click", () => showView("view-catalog"));
  document.getElementById("backToHomeBtn")?.addEventListener("click", () => showView("view-landing"));

  // Toggle panel expandible de categorías
  document.getElementById("toggleCategoryBtn")?.addEventListener("click", () => {
    const panel = document.getElementById("categoryExpandablePanel");
    if (panel) {
      const isHidden = panel.style.display === "none";
      panel.style.display = isHidden ? "block" : "none";
      document.getElementById("toggleCategoryBtn").textContent = isHidden ? "📁 Categorías ▲" : "📁 Categorías ▼";
    }
  });

  // Buscador en tiempo real
  document.getElementById("searchInput")?.addEventListener("input", renderFilteredProducts);

  document.getElementById("payBtn")?.addEventListener("click", submitOrder);
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => toggleOverlay(btn.dataset.close, false));
  });
});
