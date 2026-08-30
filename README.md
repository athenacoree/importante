# Catálogo Cuba — guía de configuración con Nexapay

Este sitio es HTML/CSS/JS puro: no necesita instalar nada ni compilar nada.
Se sube tal cual a GitHub y se publica con GitHub Pages.

## Lo que ya está hecho
- Página de bienvenida explicando la plataforma.
- Catálogo de productos (nombre, precio, foto, descripción).
- Ficha de compra: el cliente pone sus datos y el destino en Cuba, y paga con tarjeta a través de Nexapay.
- Validación del lado del servidor: aunque el cliente cambie el precio localmente en el navegador, la función de pago consulta directamente la base de datos para cobrar el precio real configurado por el administrador.
- Envío gratis y plazo de hasta 7 días mostrado en la bienvenida.
- Gesto oculto: tocar 3 veces el nombre "Catálogo Cuba" arriba abre el panel de administrador.
- Primer acceso al panel: te pide crear tu correo/contraseña (una sola vez). Las próximas veces solo pide iniciar sesión.
- Panel de administrador: agregar, editar (cambiar nombre, precio, descripción, foto), ocultar/mostrar y borrar productos, ver pedidos y registrar referidos.
- Sistema de referidos con comisión de 3%, 5% o 7%, con link propio (`?ref=CODIGO`) y comisión multinivel.
- Diseño estilo iPhone con efecto de vidrio esmerilado (blur).

## Lo que TÚ tienes que configurar

### 1) Supabase (la base de datos — gratis)
1. Entra a **supabase.com** desde el navegador y crea una cuenta.
2. Crea un proyecto nuevo.
3. Ve a **SQL Editor > New query**, pega todo el contenido de `supabase/schema.sql` y dale **Run**. Esto crea las tablas de productos, pedidos y referidos con las políticas de seguridad (RLS).
4. Ve a **Project Settings > API** y copia:
   - **Project URL** → pégalo en `js/config.js` en `SUPABASE_URL`
   - **anon public key** → pégalo en `js/config.js` en `SUPABASE_ANON_KEY`

### 2) Nexapay (para cobrar con tarjeta y recibir en criptomonedas)
Nexapay te permite cobrar a los clientes con sus tarjetas de crédito/débito desde cualquier país y recibir los pagos en tu billetera de criptomonedas.

1. Registra tu cuenta de vendedor en **Nexapay**.
2. Obtén tu **API Key** (y API Secret si aplica) desde tu panel de Nexapay.
3. Configura las claves secretas en la Edge Function de Supabase (ver paso 3).

### 3) Subir la Edge Function (`create-invoice`)
1. En el Dashboard de Supabase ve a **Edge Functions > Create a new function**, nómbrala `create-invoice`.
2. Copia y pega el contenido de `supabase/functions/create-invoice/index.ts` en el editor y despliega.
3. Ve a **Edge Functions > Secrets** (o Project Settings > Secrets) y agrega:
   - `NEXAPAY_API_KEY` = tu API Key de Nexapay
   - `NEXAPAY_SECRET` = tu API Secret de Nexapay (opcional según tu plan de Nexapay)

### 4) Subir el sitio a GitHub Pages
1. Sube este repositorio a tu cuenta de GitHub.
2. Ve a **Settings > Pages** del repositorio, en "Source" elige la rama principal y carpeta raíz.
3. En unos minutos tu sitio estará publicado.

## Cómo usar el panel de administrador y gestionar precios
1. Entra a tu sitio publicado.
2. Toca 3 veces el nombre **"Catálogo Cuba"** arriba.
3. La primera vez, crea tu correo y contraseña.
4. En la pestaña **Productos**:
   - Puedes agregar nuevos productos con su precio en USD.
   - Puedes pulsar el ícono de lápiz ✏️ en cualquier producto para modificar su nombre, precio, descripción o foto en cualquier momento.
   - El precio que configures aquí es el que se cobrará con total seguridad a través de Nexapay.
