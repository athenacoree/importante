// ============================================================
// PANEL DE ADMINISTRADOR
// ============================================================

let brandTapCount = 0;
let brandTapTimer = null;
let adminSession = null;
let editingProductId = null;

function handleBrandTap() {
  brandTapCount++;
  if (brandTapCount === 1) {
    brandTapTimer = setTimeout(() => {
      brandTapCount = 0;
    }, 1200);
  } else if (brandTapCount >= 3) {
    clearTimeout(brandTapTimer);
    brandTapCount = 0;
    openAdminModal();
  }
}

async function openAdminModal() {
  toggleOverlay("adminOverlay", true);
  showAdminScreen("loading");

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    adminSession = session;
    enterAdminPanel();
    return;
  }

  const adminExists = localStorage.getItem("admin_configured") === "true";
  if (adminExists) {
    showAdminScreen("login");
  } else {
    showAdminScreen("setup");
  }
}

async function setupAdminPassword() {
  const email = document.getElementById("setupEmail").value.trim();
  const pass = document.getElementById("setupPass").value;
  const pass2 = document.getElementById("setupPass2").value;
  const msg = document.getElementById("setupMsg");

  if (!email || pass.length < 6) {
    msg.textContent = "Pon un correo y una contraseña de al menos 6 caracteres.";
    return;
  }
  if (pass !== pass2) {
    msg.textContent = "Las contraseñas no coinciden.";
    return;
  }

  msg.textContent = "Creando acceso…";
  const { data, error } = await supabaseClient.auth.signUp({ email, password: pass });
  if (error) {
    msg.textContent = "Error: " + error.message;
    return;
  }

  localStorage.setItem("admin_configured", "true");
  msg.textContent = "";
  if (data.session) {
    adminSession = data.session;
    enterAdminPanel();
  } else {
    showAdminScreen("login");
    document.getElementById("loginMsg").textContent =
      "Cuenta creada. Si tu proyecto pide confirmar el correo, revísalo y luego inicia sesión aquí.";
  }
}

async function loginAdmin() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  const msg = document.getElementById("loginMsg");

  msg.textContent = "Entrando…";
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  if (error) {
    msg.textContent = "Contraseña o correo incorrectos.";
    return;
  }
  adminSession = data.session;
  msg.textContent = "";
  enterAdminPanel();
}

function logoutAdmin() {
  supabaseClient.auth.signOut();
  adminSession = null;
  toggleOverlay("adminOverlay", false);
}

function showAdminScreen(name) {
  ["loading", "setup", "login", "panel"].forEach((s) => {
    const el = document.getElementById("admin-" + s);
    if (el) el.style.display = s === name ? "block" : "none";
  });
}

async function enterAdminPanel() {
  showAdminScreen("panel");
  switchAdminTab("products");
}

function switchAdminTab(tab) {
  document.querySelectorAll(".admin-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".admin-panel-tab").forEach((p) => (p.style.display = p.dataset.panel === tab ? "block" : "none"));
  if (tab === "products") loadAdminProducts();
  if (tab === "orders") loadAdminOrders();
  if (tab === "referrals") loadAdminReferrals();
}

// -------- Productos (CRUD completos con Categorías) --------
async function loadAdminProducts() {
  const list = document.getElementById("adminProductList");
  list.innerHTML = "Cargando…";
  const { data, error } = await supabaseClient.from("products").select("*").order("created_at", { ascending: false });
  if (error) {
    list.innerHTML = "Error al cargar productos: " + error.message;
    return;
  }
  if (!data || !data.length) {
    list.innerHTML = `<p class="meta">No hay productos todavía. Agrega el primero abajo.</p>`;
    return;
  }
  list.innerHTML = "";
  data.forEach((p) => {
    const row = document.createElement("div");
    row.className = "admin-list-item";
    row.innerHTML = `
      <div>
        <div><strong>${escapeHtml(p.name)}</strong> — $${Number(p.price).toFixed(2)} ${escapeHtml(p.currency || 'USD')}</div>
        <div class="meta">Categoría: ${escapeHtml(p.category || 'General')} · ${p.active ? "✅ Publicado" : "🙈 Oculto"}</div>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <span style="cursor:pointer;" title="Editar producto" data-action="edit" data-id="${p.id}">✏️</span>
        <span style="cursor:pointer;" title="Mostrar/Ocultar" data-action="toggle" data-id="${p.id}" data-active="${p.active}">👁️</span>
        <span style="cursor:pointer;" title="Borrar" data-action="delete" data-id="${p.id}">🗑️</span>
      </div>`;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-action='edit']").forEach((el) =>
    el.addEventListener("click", () => {
      const prod = data.find((item) => item.id === el.dataset.id);
      if (prod) openEditProductModal(prod);
    })
  );

  list.querySelectorAll("[data-action='toggle']").forEach((el) =>
    el.addEventListener("click", async () => {
      await supabaseClient.from("products").update({ active: el.dataset.active !== "true" }).eq("id", el.dataset.id);
      loadAdminProducts();
      loadProducts();
    })
  );

  list.querySelectorAll("[data-action='delete']").forEach((el) =>
    el.addEventListener("click", async () => {
      if (!confirm("¿Borrar este producto?")) return;
      await supabaseClient.from("products").delete().eq("id", el.dataset.id);
      loadAdminProducts();
      loadProducts();
    })
  );
}

function openEditProductModal(p) {
  editingProductId = p.id;
  document.getElementById("editProdName").value = p.name || "";
  document.getElementById("editProdPrice").value = p.price;
  document.getElementById("editProdCategory").value = p.category || "General";
  document.getElementById("editProdDesc").value = p.description || "";
  document.getElementById("editProdImg").value = p.image_url || "";
  document.getElementById("editProdMsg").textContent = "";
  toggleOverlay("editProductOverlay", true);
}

async function saveEditedProduct() {
  const name = document.getElementById("editProdName").value.trim();
  const price = parseFloat(document.getElementById("editProdPrice").value);
  const category = document.getElementById("editProdCategory").value;
  const desc = document.getElementById("editProdDesc").value.trim();
  const img = document.getElementById("editProdImg").value.trim();
  const msg = document.getElementById("editProdMsg");

  if (!name || isNaN(price) || price < 0) {
    msg.textContent = "Pon nombre y precio válidos.";
    return;
  }

  msg.textContent = "Guardando cambios…";

  const { error } = await supabaseClient.from("products").update({
    name,
    price,
    category,
    description: desc,
    image_url: img,
    updated_at: new Date().toISOString()
  }).eq("id", editingProductId);

  if (error) {
    msg.textContent = "Error al actualizar: " + error.message;
    return;
  }

  msg.textContent = "Producto actualizado correctamente.";
  setTimeout(() => {
    toggleOverlay("editProductOverlay", false);
    loadAdminProducts();
    loadProducts();
  }, 800);
}

async function addProduct() {
  const name = document.getElementById("newProdName").value.trim();
  const price = parseFloat(document.getElementById("newProdPrice").value);
  const category = document.getElementById("newProdCategory").value;
  const desc = document.getElementById("newProdDesc").value.trim();
  const img = document.getElementById("newProdImg").value.trim();
  const msg = document.getElementById("newProdMsg");

  if (!name || isNaN(price) || price < 0) {
    msg.textContent = "Pon nombre y precio válidos.";
    return;
  }

  const { error } = await supabaseClient.from("products").insert({
    name,
    price,
    category,
    description: desc,
    image_url: img,
    active: true,
  });

  if (error) {
    msg.textContent = "Error: " + error.message;
    return;
  }
  msg.textContent = "Producto agregado correctamente.";
  document.getElementById("newProdName").value = "";
  document.getElementById("newProdPrice").value = "";
  document.getElementById("newProdDesc").value = "";
  document.getElementById("newProdImg").value = "";
  loadAdminProducts();
  loadProducts();
  setTimeout(() => (msg.textContent = ""), 2000);
}

// -------- Pedidos --------
async function loadAdminOrders() {
  const list = document.getElementById("adminOrderList");
  list.innerHTML = "Cargando…";
  const { data, error } = await supabaseClient.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) {
    list.innerHTML = "Error al cargar pedidos: " + error.message;
    return;
  }
  if (!data || !data.length) {
    list.innerHTML = `<p class="meta">Todavía no hay pedidos.</p>`;
    return;
  }
  list.innerHTML = "";
  data.forEach((o) => {
    const row = document.createElement("div");
    row.className = "admin-list-item";
    const invoiceIdText = o.nexapay_invoice_id || o.qvapay_invoice_id ? ` · Nexapay ID: ${escapeHtml(o.nexapay_invoice_id || o.qvapay_invoice_id)}` : '';
    row.innerHTML = `
      <div>
        <div><strong>${escapeHtml(o.product_name)}</strong> — $${Number(o.amount).toFixed(2)}</div>
        <div class="meta">${escapeHtml(o.buyer_name)} (${escapeHtml(o.buyer_contact)}) · Destino: ${escapeHtml(o.shipping_destination)}${o.referral_code ? " · ref: " + escapeHtml(o.referral_code) : ""}${invoiceIdText}</div>
      </div>
      <span class="pill ${o.status === "paid" ? "paid" : "pending"}">${o.status}</span>`;
    list.appendChild(row);
  });
}

// -------- Referidos --------
async function loadAdminReferrals() {
  const list = document.getElementById("adminReferralList");
  list.innerHTML = "Cargando…";
  const { data, error } = await supabaseClient.from("referrers").select("*").order("created_at", { ascending: false });
  if (error) {
    list.innerHTML = "Error al cargar referidos: " + error.message;
    return;
  }
  if (!data || !data.length) {
    list.innerHTML = `<p class="meta">Todavía no hay referidos registrados.</p>`;
    return;
  }

  const { data: report } = await supabaseClient.from("commission_report").select("*");

  list.innerHTML = "";
  data.forEach((r) => {
    const earned = (report || [])
      .filter((row) => row.referrer_code === r.code)
      .reduce((sum, row) => sum + Number(row.referrer_commission), 0);
    const link = `${SITE_BASE_URL}?ref=${r.code}`;
    const row = document.createElement("div");
    row.className = "admin-list-item";
    row.style.flexDirection = "column";
    row.style.alignItems = "flex-start";
    row.innerHTML = `
      <div style="width:100%; display:flex; justify-content:space-between;">
        <div><strong>${escapeHtml(r.full_name)}</strong> (${r.commission_percent}%)</div>
        <div><strong>$${earned.toFixed(2)}</strong> ganado</div>
      </div>
      <div class="meta">${escapeHtml(r.contact)}${r.referred_by_code ? " · referido por " + escapeHtml(r.referred_by_code) : ""}</div>
      <div class="referral-link" style="margin-top:6px;">${link}</div>`;
    list.appendChild(row);
  });
}

async function addReferrer() {
  const name = document.getElementById("newRefName").value.trim();
  const contact = document.getElementById("newRefContact").value.trim();
  const tier = parseFloat(document.getElementById("newRefTier").value);
  const upline = document.getElementById("newRefUpline").value.trim();
  const msg = document.getElementById("newRefMsg");

  if (!name || !contact) {
    msg.textContent = "Pon nombre y contacto.";
    return;
  }

  const code = (name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) + Math.floor(Math.random() * 900 + 100)).toUpperCase();

  const { error } = await supabaseClient.from("referrers").insert({
    code,
    full_name: name,
    contact,
    commission_percent: tier || 3,
    referred_by_code: upline || null,
  });

  if (error) {
    msg.textContent = "Error: " + error.message;
    return;
  }
  msg.textContent = `Referido creado. Código: ${code}`;
  document.getElementById("newRefName").value = "";
  document.getElementById("newRefContact").value = "";
  document.getElementById("newRefUpline").value = "";
  loadAdminReferrals();
}

// -------- Init --------
document.addEventListener("DOMContentLoaded", () => {
  const brandEl = document.getElementById("brand");
  if (brandEl) brandEl.addEventListener("click", handleBrandTap);

  const setupBtn = document.getElementById("setupBtn");
  if (setupBtn) setupBtn.addEventListener("click", setupAdminPassword);

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) loginBtn.addEventListener("click", loginAdmin);

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logoutAdmin);

  const addProductBtn = document.getElementById("addProductBtn");
  if (addProductBtn) addProductBtn.addEventListener("click", addProduct);

  const saveEditProdBtn = document.getElementById("saveEditProdBtn");
  if (saveEditProdBtn) saveEditProdBtn.addEventListener("click", saveEditedProduct);

  const addReferrerBtn = document.getElementById("addReferrerBtn");
  if (addReferrerBtn) addReferrerBtn.addEventListener("click", addReferrer);

  document.querySelectorAll(".admin-tab").forEach((t) =>
    t.addEventListener("click", () => switchAdminTab(t.dataset.tab))
  );
});
