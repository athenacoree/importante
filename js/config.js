// ============================================================
// CONFIGURACIÓN — pon aquí tus datos reales de Supabase.
// Los sacas en: Supabase Dashboard > Project Settings > API
// ============================================================
const SUPABASE_URL = "PEGA_AQUI_TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_SUPABASE_ANON_KEY";

// Nombre y bandera que se muestran arriba (tócalo 3 veces para el panel admin)
const SITE_NAME = "Catálogo Cuba";
const SITE_FLAG = "🇨🇺";

// URL base de tu sitio publicado (para armar los links de referido)
// Ej: "https://tuusuario.github.io/catalogo-cuba"
const SITE_BASE_URL = window.location.origin + window.location.pathname.replace(/index\.html$/, "");
