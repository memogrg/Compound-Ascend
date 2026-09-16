# Prompt 0.3 — chore/qa-snapshots (línea base visual ANTES de tocar CSS)

Sin esta línea base no se puede demostrar que el refactor de `globals.css` (0.4) no cambió nada. El script queda para todo el proyecto: es la herramienta de regresión visual de cada pantalla.

---

Contexto: rama nueva `chore/qa-snapshots` desde `main`. Ya existe Playwright (`@playwright/test` en devDependencies, `playwright.config.ts`, `tests/e2e/smoke.spec.ts` que inicia sesión con `E2E_EMAIL`/`E2E_PASSWORD` contra `/login` usando `getByLabel("Correo")`, `#password` y el botón «Iniciar sesión»). Leé esos dos archivos antes de escribir nada. No modifiques el smoke test.

Objetivo: un script `scripts/qa/snap.mjs` que capture las pantallas de la app en tres anchos y permita comparar dos corridas.

1. `scripts/qa/snap.mjs` (ESM, sin dependencias nuevas; usa `playwright` que ya trae `@playwright/test`):
   - Argumentos: `--out <carpeta>` (obligatorio), `--base-url` (default `http://localhost:3001`), `--theme light|dark|both` (default `both`), `--widths 390,768,1280` (default).
   - Inicia sesión una vez con `E2E_EMAIL`/`E2E_PASSWORD` (mismos selectores que el smoke) y reutiliza el `storageState` para todas las páginas.
   - Rutas a capturar (constante `ROUTES` al inicio del archivo, exportada): `/dashboard`, `/mis-acciones`, `/mis-acciones?tab=decisiones`, `/mis-acciones?tab=progreso`, `/asistente`, `/mi-base-financiera`, `/ingresos`, `/gastos`, `/transacciones`, `/control-financiero`, `/deudas`, `/patrimonio`, `/patrimonio/proteccion`, `/patrimonio/indicadores`, `/mi-rich-life`, `/mi-perfil-financiero`, `/configurar`, `/configuracion`, `/suscripcion`, y públicas sin sesión: `/`, `/faqs`, `/login`, `/empezar`.
   - Por ruta × ancho × tema: `page.emulateMedia({ colorScheme })`, `page.setViewportSize`, `goto` con `waitUntil: 'networkidle'`, espera adicional de 800 ms, y `screenshot({ fullPage: true, animations: 'disabled' })` a `<out>/<tema>/<ancho>/<ruta-slug>.png`. Congelá la fecha con `page.clock.setFixedTime(new Date('2026-08-16T12:00:00-06:00'))` antes de cada `goto` (Playwright 1.62 instalado; la API existe desde 1.45) para que los «hoy» no cambien entre corridas.
   - Tema oscuro: la app persiste el tema en `localStorage` con la clave `ca-theme` y lo fija como `data-theme` en `<html>` desde un script anti-parpadeo del layout raíz (ver `src/components/layout/theme-provider.tsx`). Para capturar en oscuro, además de `emulateMedia`, inyectá `localStorage.setItem('ca-theme','dark')` con `context.addInitScript` antes de navegar; para claro, `'light'`.
   - Escribe `<out>/manifest.json` con ruta, ancho, tema, archivo, tiempo hasta `networkidle` y errores de consola capturados (`page.on('pageerror')`).
2. `scripts/qa/diff.mjs`: compara dos carpetas (`--a`, `--b`) imagen a imagen **sin dependencias nuevas**: abrí un Chromium headless con `playwright`, cargá cada par de PNG como `data:` URI en una página en blanco, dibujalos en dos `<canvas>` y compará `getImageData` píxel a píxel (tolerancia 0 por defecto; `--threshold` opcional). Escribí un PNG de diferencias (píxeles distintos en rojo sobre la imagen A al 30 %) en `<out-diff>/`, imprimí una tabla resumen (imagen · píxeles distintos · %) y salí con código 1 si alguna supera `--max-diff-pixels` (default 0). Si los tamaños difieren, reportalo como diferencia total.
3. `package.json`: agregá `"qa:snap": "node scripts/qa/snap.mjs"` y `"qa:diff": "node scripts/qa/diff.mjs"`.
4. `.gitignore`: agregá `qa-snapshots/` (las capturas no se versionan).
5. Documentá el uso en `docs/cartera-plus-redesign/qa/README.md` (10 líneas): cómo levantar `next build && next start -p 3001` (NUNCA `next dev`: StrictMode esconde animaciones y el orden de hidratación cambia), variables `E2E_*`, y el ciclo base → cambio → diff.
6. Corré la línea base ahora: con `npm run build && npm run start -- -p 3001` en otra terminal (pedime que lo levante si no podés), `E2E_EMAIL=... E2E_PASSWORD=... npm run qa:snap -- --out qa-snapshots/base`. Mostrame el resumen del manifest (rutas OK, errores de consola por ruta).
7. `npm run typecheck && npm run lint`. Stageá solo `scripts/qa/*`, `package.json`, `.gitignore`, `docs/cartera-plus-redesign/qa/README.md` y proponé el commit `chore(qa): capturas por ruta/ancho/tema y diff de píxeles para regresión visual` sin ejecutarlo.

Restricciones: cero dependencias nuevas; no toques `playwright.config.ts` ni `tests/`; no cambies nada bajo `src/`.
