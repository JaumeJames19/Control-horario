# Control horario para pymes

Aplicación web para el **registro de jornada obligatorio** de una pyme española: entrada, pausas y salida de cada trabajador, con correcciones auditables, vacaciones, calendario laboral y exportaciones para la gestoría.

> ⚠️ **Aviso: todos los datos de este repositorio son ficticios.** La empresa ("Empresa Demo"), la localidad ("Localidad Demo"), los trabajadores de los tests ("Ana Demo", "Berta Demo"…) y cualquier identificador son de ejemplo. No contiene datos personales reales ni claves. Es una versión pública para portfolio de una app que está en uso real.

## El problema que resuelve

Desde 2019, el artículo 34.9 del Estatuto de los Trabajadores obliga a **todas las empresas** a registrar cada día la hora de inicio y fin de la jornada de cada trabajador y a conservar ese registro durante 4 años, a disposición de los trabajadores, sus representantes y la Inspección de Trabajo.

En una pyme esto suele acabar en hojas de papel o en Excel que nadie revisa, que se pueden modificar sin dejar rastro y que no sirven ante una inspección. Esta app lo resuelve con:

- Un fichaje rápido desde el móvil de cada trabajador o desde una tableta compartida en el almacén.
- Un registro **inmutable**: la hora la pone el servidor y los fichajes nunca se editan. Una corrección es una solicitud y una decisión aparte, y el original se conserva.
- El cálculo automático de horas, horas extra y saldo de vacaciones según el convenio.
- Exportaciones listas para la gestoría y un acceso de solo lectura para la Inspección.

## Stack

- **[Lovable](https://lovable.dev)**: generación e iteración de la app con IA y despliegue en Cloudflare Workers.
- **[Supabase](https://supabase.com)**: Postgres con Row Level Security y funciones RPC, Auth con doble factor (TOTP).
- **React** con **TanStack Start** (SSR y funciones de servidor) y **Vite**.
- **Tailwind CSS** y **shadcn/ui** para la interfaz.
- **Vitest** y Testing Library para los tests.
- **Web Push** (VAPID, RFC 8291/8292) implementado sobre WebCrypto, sin dependencias.

## Funcionalidades

| Quién | Qué puede hacer |
|---|---|
| **Trabajador** | Fichar entrada, pausa, vuelta y salida (y tiempo de espera si es conductor). Ver sus horas del día, la semana y el mes. Pedir correcciones, vacaciones y otras ausencias viendo su saldo. Cerrar cada mes como *conforme* o con una discrepancia. |
| **Encargado** | Alta y baja de trabajadores, reseteo de PIN, aprobación de correcciones y ausencias, calendario laboral (festivos, cierres de empresa, horarios especiales) y exportación del mes en Excel, PDF o CSV. |
| **Tableta** (`/?kiosco`) | Fichar con usuario y PIN desde un dispositivo compartido, con lista opcional de IPs permitidas. |
| **Inspección** | Consulta de todo en solo lectura, con histórico completo exportable. |

Además:

- **Acceso con usuario y PIN de 6 cifras**, pensado para trabajadores sin correo corporativo. El PIN se cambia obligatoriamente en el primer acceso.
- **Seguridad**: bloqueo tras 5 PIN fallidos en 15 minutos, registro de cada intento, contraseña real derivada con HMAC y un *pepper* rotable, y doble factor obligatorio para el encargado.
- **Reglas del convenio configurables**: pausa pagada, horas extra semanales al 150 % en domingos, festivos y nocturnidad, y tiempo de presencia de conductores (RD 1561/1995).
- **Avisos de descansos legales**: 12 h entre jornadas y descanso semanal.
- **Jornada olvidada**: una jornada abierta más de 16 h exige una corrección.
- **Calendario laboral por años**, importable en JSON, con festivos nacionales, autonómicos y locales.
- **Avisos push** en el móvil para olvidos de fichar, solicitudes y decisiones.
- **Interfaz en castellano y catalán.**
- **Sin geolocalización**: se registra la lectura del aviso de privacidad.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/components/fichaje/` | Pantallas de la app (fichar, equipo, ausencias, ajustes, kiosco…) |
| `src/lib/fichaje.ts`, `src/lib/jornada.ts` | Lógica de cálculo de horas, con tests |
| `src/lib/*.functions.ts` | Funciones de servidor (login, PIN, altas, avisos) |
| `drizzle/migrations/` | Migraciones SQL numeradas: tablas, RLS, RPC y disparadores |
| `AGENTS.md` | Decisiones de diseño y su porqué |

## Cómo arrancarlo en local

Requisitos: Node.js 22 o superior (o [Bun](https://bun.sh)) y un proyecto de Supabase propio.

1. **Instala las dependencias.**

   ```sh
   npm install      # o: bun install
   ```

2. **Configura las variables de entorno.** Copia la plantilla y rellénala con los datos de tu proyecto de Supabase (*Project Settings → API*).

   ```sh
   cp .env.example .env
   node scripts/vapid.mjs   # genera VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y PIN_PEPPER
   ```

3. **Crea el esquema de la base de datos.** Ejecuta en orden los ficheros de `drizzle/migrations/` (de `0000` a `0018`) en el editor SQL de Supabase, o con `psql`:

   ```sh
   for f in drizzle/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
   ```

4. **Crea el primer encargado.** Las altas públicas están deshabilitadas a propósito, así que el primero se crea a mano. En el editor SQL de Supabase, autoriza su correo (la autorización caduca a los 10 minutos):

   ```sql
   insert into public.altas_autorizadas (email) values ('admin@fichaje.local');
   ```

   Después, en *Authentication → Users*, crea el usuario `admin@fichaje.local` con un PIN temporal de 6 cifras como contraseña y marca *Auto Confirm User*. Por último, dale el rol de administrador:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'admin@fichaje.local';
   ```

   Entra con el usuario `admin` y ese PIN. La app te obligará a cambiarlo y a configurar el doble factor antes de dejarte gestionar el equipo.

5. **Arranca la app.**

   ```sh
   npm run dev      # servidor de desarrollo
   npm test         # tests
   npm run test:sql # reglas de la base de datos (necesita Postgres local, variables PG*)
   npm run lint     # linter
   ```

## Licencia y uso

Código publicado como muestra de portfolio. Si quieres reutilizarlo en tu empresa, revisa antes que las reglas de cálculo coinciden con tu convenio colectivo.
