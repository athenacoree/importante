// Cliente único de Supabase, usado por catalog.js y admin.js
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
