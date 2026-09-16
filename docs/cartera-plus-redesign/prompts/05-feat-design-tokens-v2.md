# Prompt 0.5 — feat/design-tokens-v2 (tokens de gráfico y motion + formateador único)

Requiere 0.4 mergeado (los tokens van a `src/styles/tokens.css`).

---

Contexto: rama `feat/design-tokens-v2` desde `main`. El rediseño aprobó un lenguaje de gráficos (ver `docs/cartera-plus-redesign/prototipos/tokens.css` y el Artifact /dev/ui). En este prompt solo se agregan tokens y un formateador; ninguna pantalla cambia todavía.

1. `src/styles/tokens.css`: agregá, en el bloque claro y en los dos bloques oscuros (`prefers-color-scheme` y `[data-theme="dark"]`, respetando cómo esté declarado el tema hoy), exactamente estos tokens (copialos de `docs/cartera-plus-redesign/prototipos/tokens.css`, no los reinventes):
   - `--chart-1 … --chart-6` (claro: `#378451 #3a6ea5 #c48a2e #7b5ea7 #c34f4b #0f9aa8`; oscuro: `#3f9560 #5a8ccb #c4862c #9b7cc8 #d46460 #28a2b0`), `--chart-grid`, `--chart-axis`, `--chart-crosshair`, `--chart-glow`, `--chart-gradient-top: .28`, `--chart-gradient-bottom: 0`.
   - `--dur-micro: 120ms; --dur-std: 200ms; --dur-tr: 320ms; --dur-range: 450ms; --dur-number: 600ms; --ease-std: cubic-bezier(.2,0,0,1); --ease-in: cubic-bezier(.05,.7,.1,1); --ease-out: cubic-bezier(.3,0,.8,.15);`
   - Un bloque `@media (prefers-reduced-motion: reduce) { :root { --dur-micro: 0ms; --dur-tr: 0ms; --dur-range: 0ms; --dur-number: 0ms; --dur-std: 150ms; } }`.
   - Documentá arriba del bloque, en un comentario de 6 líneas, el orden fijo de series (1 ingresos/positivo · 2 inversiones · 3 gasto fijo · 4 gasto variable · 5 deudas/negativo · 6 ahorro y metas) y que la paleta pasó el validador de daltonismo (ΔE ≥ 8 adyacentes, contraste ≥ 3:1) en claro y oscuro.
2. Exponé los tokens a Tailwind en `@theme inline` solo si el resto de tokens ya se exponen así (mirá cómo están `--color-*`); si no, no lo hagas.
3. `src/lib/format.ts`: ya tiene `formatMoney`, `formatPercent`, `formatCompact`, `formatAxisCompact`, `formatMonthYear`. Agregá, sin cambiar las existentes:
   - `formatDelta(value, currency, {signDisplay:'exceptZero'})` → `+₡2 500` / `−₡2 500` (usa `Intl.NumberFormat('es-CR', …signDisplay)`; el menos es U+2212).
   - `formatPct1(ratio)` → `12,3 %` (una decimal, coma, espacio duro antes de %).
   - `formatDayMonth(iso)` → `16 ago`; `formatMonthShort(iso)` → `ago 26`.
   - Tests en `tests/unit/format.test.ts` para las nuevas y para `formatMoney` con CRC/USD: el separador de miles de `es-CR` es U+00A0 (espacio duro); los tests deben comparar con ` `, no con espacio normal.
4. Buscá formateo a mano de moneda fuera de `format.ts` (`grep -rnE "toLocaleString\(|Intl\.NumberFormat" src --include=*.tsx --include=*.ts | grep -v lib/format.ts`) y listá los archivos. No los cambies aquí; el listado va al PR como deuda a saldar en cada pantalla.
5. Página interna `src/app/(dashboard)/dev/ui/page.tsx` (solo en desarrollo: devolvé `notFound()` si `process.env.NODE_ENV === 'production'`): renderiza las 12 muestras de color (`--chart-*`, `--pos/--warn/--neg`, grid, crosshair, glow) con su nombre y valor computado, la escala tipográfica (42/23/17/13.5/11/10.5) y los cuatro botones de duración de motion, usando solo clases existentes del design system. Es el punto de partida del catálogo de primitivas que crecerá en la fase 2.
6. `npm run typecheck && npm run lint && npm run test`. Capturas: `npm run qa:snap -- --out qa-snapshots/tokens` y diff contra `qa-snapshots/base` — debe ser 0 px en todas las rutas existentes (los tokens nuevos no se usan aún). Stageá `src/styles/tokens.css`, `src/lib/format.ts`, `tests/unit/format.test.ts`, `src/app/(dashboard)/dev/ui/page.tsx` y proponé dos commits sin ejecutarlos:
   - `feat(design): tokens de gráfico y motion (claro/oscuro, reduced motion) + página interna /dev/ui`
   - `feat(format): formatDelta, formatPct1 y fechas cortas con tests; inventario de formateo manual`
