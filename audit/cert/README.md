# Cert E2E harness (Fase 2)

Harness E2E real que ejercita journeys CRUD por navegador en **web-desktop** y en el
**shell móvil `/m`** (emulación de dispositivo de Playwright), con login por UI real,
seeding contra la BD de **prueba**, y captura de evidencia. Reutilizable antes de cada
release. Lo corre el fundador en local: `npm run cert:e2e`.

## Correr

```bash
npm run cert:e2e
```

Requisitos:
- `.env.local` con `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
  `SUPABASE_TEST_SERVICE_ROLE_KEY` (ya presentes). El harness **nunca** toca producción
  (ver Seguridad).
- **Node 22+** (supabase-js inicializa Realtime y necesita WebSocket nativo).
- Navegador de Playwright la primera vez: `npx playwright install chromium`.

Se ejecuta desde la raíz del repo (el `cwd` que asume el harness).

Salida:
- `audit/evidence/<runId>/report.md` + `report.json` — pass/fail por journey + rutas de screenshots.
- `audit/evidence/<runId>/<project>/NN-*.png` — screenshots de estados clave.
- Todo bajo `audit/evidence/` y `audit/.auth/` está **gitignored**.

## Seguridad — el navegador habla con TEST, nunca con prod

`.env.local` trae a la vez las credenciales de prod (`NEXT_PUBLIC_SUPABASE_URL`) y las de
prueba (`SUPABASE_TEST_*`). Sin cuidado, `npm run dev` hablaría con **prod**. Defensa en
tres capas:

1. **Puerto 3100 dedicado + `reuseExistingServer:false`** → siempre un dev server fresco,
   nunca uno que ya tengas corriendo en 3000 apuntando a prod.
2. **`webServer.env` inyecta las creds TEST**. Playwright lanza el server con
   `{ ...process.env, ...webServer.env }` y Next **no** pisa una var ya presente en
   `process.env` con `.env.local` → la URL TEST inyectada **gana** sobre la de prod.
3. **Prueba empírica** (`global.setup.ts`): tras el login por UI se afirma que la cookie
   de sesión emitida es `sb-<testRef>-…` y **nunca** `sb-<prodRef>-…`. El login es una
   server action (la llamada a Supabase es server-side), así que la cookie emitida es el
   observable que prueba contra qué BD autenticó el dev server.

Además `assertTestDb()` aborta si faltan las creds TEST o si `SUPABASE_TEST_URL` apunta al
mismo proyecto que prod.

## Estructura

```
audit/cert/
  playwright.cert.config.ts   # 5 proyectos: setup → {web-desktop, mobile-iphone, mobile-android} → cleanup
  global.setup.ts             # guard + seed + login UI real (web+móvil) + storageState + verificación de cookie TEST
  global.teardown.ts          # compila report.md/json + borra el usuario de prueba
  fixtures.ts                 # inyecta el POM por `surface` del proyecto + evidencia + admin service-role
  journeys/
    reference.spec.ts         # journey de referencia (corre en las 3 superficies)
  pods/
    journey.ts                # interfaz Journey (contrato surface-agnóstico)
    web.pods.ts               # WebJourney (rutas web)
    mobile.pods.ts            # MobileJourney (rutas /m, BottomSheets)
    login.ts                  # login por UI real (web + móvil)
    util.ts
  lib/
    env.ts                    # creds TEST + guard fail-fast
    seed.ts                   # createCertUser (patrón de sim/harness) + reads de confirmación
    context.ts                # run context (cross-process) + rutas de auth/evidencia
    evidence.ts               # shot() + compilación del reporte
    devices.ts                # descriptores iPhone/Android compartidos
  TESTID-CANDIDATES.md        # selectores frágiles → delta de app (data-testid) antes de Fase 5/6
```

## Seeding (Fase 2)

Solo `createCertUser` (patrón de `sim/harness.ts`: create → sign in → `ensure_household`
→ moneda CRC + tz UTC) **+ `onboarding_completed`**. **Sin** precondiciones (deuda,
holding): se difieren a Fase 5/6 y se construirán sobre los **servicios/app-driver** de la
app, nunca INSERT service-role crudos.

## Journey de referencia — qué certifica

`login (UI real, storageState) → crear ingreso → crear gasto → verificar persistencia`, en
las 3 superficies. Aserción **primaria** (dura): el elemento creado es visible tras
recargar **y** la fila queda confirmada por service-role (monto · moneda · **household**).
El número "Flujo del mes" es **secundario/informativo** — nunca es gate (número-vs-oracle
es Fase 4/5).

## Riesgo conocido

Si el watcher de Next dev entra en bucle al escribir PNGs en `audit/evidence/` (mismo
síntoma que motivó el `outputDir=/tmp` del smoke), reubicar la evidencia a `/tmp`. La
salida propia de Playwright (traces) ya va a `/tmp/compound-cert-results`.

## Alcance de journeys

Este harness prueba el **motor** con un journey de referencia. La **matriz completa**
(editar/borrar, pago de deuda, aporte a meta, inversión, etc.) es Fase 5/6.
