# Prompt 0.6 — chore/nuqs-axe (filtros en URL y auditoría a11y automática)

---

Contexto: rama `chore/nuqs-axe` desde `main`. Dos dependencias aprobadas para la fase de fundamentos. Antes de instalar, verificá versión y licencia con `npm view <pkg> version license peerDependencies` y pegame el resultado.

1. `nuqs` (fijado en **2.10.1**, MIT). Montá `NuqsAdapter` desde `nuqs/adapters/next/app` en el layout raíz (`src/app/layout.tsx`) envolviendo a los `children`, sin tocar nada más del layout. Creá `src/lib/url-state/period.ts` con `periodParser` y `comparisonParser` (`'prev' | 'yoy' | 'budget' | 'avg3'`, default `'prev'`).

   **CORRECCIÓN (lo que se hizo, y prevalece):** los parsers son **puros, síncronos y client-safe**, sin default temporal. `periodParser` valida la CADENA `YYYY-MM` con regex estricto (`^\d{4}-(0[1-9]|1[0-2])$`) y devuelve la cadena o `null`; la conversión a `Period` sigue en `parseMonthParam`/`monthParam` de `financial-base/engine/period.ts`, que ya existían y ya reciben el fallback por parámetro. **No** se usa `userCurrentPeriod()` adentro: es `server-only`, es `async` y devuelve un `Period`, no una cadena — importarlo rompería el bundle de cliente y el mes por defecto pasaría a calcularse con el reloj del servidor (UTC en Vercel). El período lo pasa el server component que ya conoce la zona del usuario.

   `createSearchParamsCache` queda **diferido**: sin consumidor todavía, y viene de `nuqs/server`, así que exportarlo del mismo módulo arrastraría código de servidor a cualquier componente cliente que importe `periodParser`. Cuando haga falta irá en `period.server.ts`, importado solo desde server components.

   Tests en `tests/unit/url-state-period.test.ts` (no `url-state.test.ts`): válidos, inválidos, límites, ida y vuelta, default de comparación, y una guardia que lee el fuente y afirma que el módulo no importa `server-only` ni `userCurrentPeriod`.
2. `@axe-core/playwright` (fijado en **4.13.0**, MPL-2.0) como devDependency. Creá `tests/a11y/routes.spec.ts` con `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`. Por ahora **no falla**: solo mide.

   **CORRECCIÓN (lo que se hizo, y prevalece):** las rutas se leen de **`scripts/qa/routes.json`**, no de la constante `ROUTES` de `snap.mjs`: el cargador de TypeScript de Playwright transpila los `.mjs` importados a CommonJS y el import revienta con «exports is not defined in ES module scope», dejando 0 tests. El JSON es la fuente única — `snap.mjs` lee exactamente el mismo archivo. Se audita en **1280 y 390** (no solo 1280), tema light; el tema dark queda pendiente.

   La salida se parte en dos: el **JSON crudo** por ruta y ancho en `qa-snapshots/a11y/` (ignorado por git, como el resto de `qa-snapshots/`) y el **informe legible** en `docs/cartera-plus-redesign/qa/a11y-baseline.md`, que sí se versiona. No es `a11y-summary.md` y no lo escribe el spec: lo genera `scripts/qa/a11y-report.mjs` desde los JSON, para poder rehacerlo sin volver a auditar. Config aparte `playwright.a11y.config.ts` (sin `webServer`, baseURL :3001), script `"test:a11y": "playwright test -c playwright.a11y.config.ts"`. No se toca `playwright.config.ts` ni el smoke.
3. Corré `npm run test:a11y` contra el **servidor congelado** (`QA_FREEZE=… npm run qa:start`, ver el README de QA), no contra `npm run start` a secas: sin congelar, una fecha o un precio distinto cambia el DOM y con él el conteo de nodos, y el inventario deja de ser comparable entre días. Después, `node scripts/qa/a11y-report.mjs`.
4. `npm run typecheck && npm run lint && npm run test`, **en la rama y después del último archivo tocado**. No hizo falta tocar `.gitignore`: `qa-snapshots/` ya estaba ignorado entero.
   - `chore(deps): nuqs para filtros en URL; parsers de periodo y comparación con tests`
   - `chore(a11y): auditoría axe por ruta con resumen; línea base sin gate`
