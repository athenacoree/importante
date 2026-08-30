-- ============================================================
-- Esquema para "Catálogo Cuba" — compra/venta con envío a Cuba
-- Integrado con Nexapay para cobro con tarjeta y saldo en cripto
-- Ejecutar esto en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1) PRODUCTOS ------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'USD',
  image_url text default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) REFERIDOS --------------------------------------------------
create table if not exists public.referrers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- código corto para el link (?ref=CODE)
  full_name text not null,
  contact text not null,                   -- teléfono / usuario de contacto
  commission_percent numeric(4,2) not null default 3.00, -- 3, 5 o 7
  referred_by_code text references public.referrers(code),
  created_at timestamptz not null default now()
);

-- 3) PEDIDOS ------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  product_name text not null,
  amount numeric(10,2) not null,
  buyer_name text not null,
  buyer_contact text not null,
  shipping_destination text not null,       -- dirección / municipio en Cuba
  referral_code text references public.referrers(code),
  nexapay_invoice_id text,                  -- ID de factura / transacción de Nexapay
  status text not null default 'pending',   -- pending | paid | shipped | cancelled
  created_at timestamptz not null default now()
);

-- 4) TABLA DE CONFIGURACIÓN Y ADMIN ------------------------------
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

-- Inserta por defecto flag de admin desconfigurado si no existe
insert into public.app_config (key, value)
values ('admin_email', '')
on conflict (key) do nothing;

-- 5) VISTA DE COMISIONES (incluye comisión multinivel) -----------
create or replace view public.commission_report as
select
  o.id as order_id,
  o.created_at,
  o.amount,
  o.status,
  r.code as referrer_code,
  r.full_name as referrer_name,
  r.commission_percent,
  round(o.amount * r.commission_percent / 100, 2) as referrer_commission,
  r.referred_by_code as upline_code,
  round(o.amount * r.commission_percent / 100 * 0.01, 2) as upline_commission
from public.orders o
join public.referrers r on r.code = o.referral_code
where o.status = 'paid';

-- 6) Seguridad (RLS) ----------------------------------------------
alter table public.products enable row level security;
alter table public.referrers enable row level security;
alter table public.orders enable row level security;
alter table public.app_config enable row level security;

-- Productos
create policy "productos visibles a todos" on public.products
  for select using (active = true or auth.role() = 'authenticated');

create policy "admin gestiona productos" on public.products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Referidos
create policy "cualquiera se registra como referido" on public.referrers
  for insert with check (true);

create policy "referidos visibles a todos" on public.referrers
  for select using (true);

create policy "admin edita referidos" on public.referrers
  for update using (auth.role() = 'authenticated');

create policy "admin borra referidos" on public.referrers
  for delete using (auth.role() = 'authenticated');

-- Pedidos
create policy "cualquiera crea pedidos" on public.orders
  for insert with check (true);

-- Permitir leer pedidos creados públicamente
create policy "permitir select al crear pedidos" on public.orders
  for select using (true);

create policy "admin edita pedidos" on public.orders
  for update using (true);

-- Configulación
create policy "config visible a todos" on public.app_config
  for select using (true);

create policy "config editable por admin o primera vez" on public.app_config
  for all using (true) with check (true);
