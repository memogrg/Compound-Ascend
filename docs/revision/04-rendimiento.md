# Revisión de producción · 04 — Rendimiento (en curso)

> Rama `refactor/fase-4-rendimiento`. Baseline de referencia: `00-baseline.md`
> (F0). Metodología: una optimización = un commit con su métrica; lo que altera
> comportamiento visible o config se aprueba antes de tocarse.

## Aplicado

### 1. `React cache()` en los fetchers repetidos (commit 1)
- **Evidencia del problema (auditoría):** por cada request, `getBaseSummary` se
  invocaba 4×, `getFxRates` 5×, `getDisplayCurrency` 4× — cada invocación con
  sus queries a Supabase.
- **Cambio:** `cache()` de React sobre `getBaseSummary`, `getPrimaryCurrency`,
  `getDisplayCurrency` y `getFxRates`. Cero cambios de firma.
- **Métrica:** dedup por request → ~10 rondas de queries eliminadas por carga
  de página en dashboard/control/rich-life. Bundles idénticos (server-side).

### 2. Fetch del perfil en paralelo (commit 2)
- `dashboard-service` esperaba el `Promise.all` y LUEGO pedía
  `profiles.display_name` (independiente). Ahora va en el mismo lote: una
  ronda de red menos en `/dashboard`.

## Corrección a la auditoría (honestidad de datos)

El hallazgo #2 del TOP 10 ("precios de mercado secuenciales, peor caso 60 s")
estaba **sobredimensionado**: `fetchNormalizedPrices` ya paraleliza con
`Promise.all` entre símbolos, y `getPortfolioMarketValues` ya cae a
`averageCost` cuando falta precio. El riesgo residual real es la **cadena de
proveedores secuencial por símbolo** (Finnhub→AlphaVantage→Yahoo, 6 s de
timeout c/u → 18 s peor caso por símbolo frío, en paralelo entre símbolos).
Mitigación propuesta: bajar timeout a 3 s — es cambio de configuración →
pendiente de aprobación (lista abajo).

## Bundles (sin cambio aún — los commits 1-2 son server-side)

First Load JS actual (idéntico al baseline F2-post-formato): compartido 102 kB;
gastos/ingresos/transacciones/mi-base 328 kB; mi-rich-life 260 kB;
dashboard 219 kB. La reducción de bundles llega con los items de la lista de
aprobación (recharts dynamic + Server Components).

## Pendientes de aprobación (alteran comportamiento visible o config) — [GRANDE]

1. **recharts vía `next/dynamic` (ssr:false) con skeleton** en las 5 vistas
   pesadas — los charts pasan a montarse tras hidratar (parpadeo breve de
   skeleton). Es lo que baja los 328 kB. (#4 del TOP)
2. **Suspense + streaming con skeletons** en dashboard y patrimonio. (#7)
3. **Índice compuesto** `transactions(user_id, occurred_on desc)` +
   `budget_items(user_id, period_year, period_month)` — SQL en
   `01-auditoria.md` §3; NO aplicado. (#9)
4. **Timeout de market-data 6 s → 3 s** por proveedor (config).
5. **Server Components**: el único candidato sólido sin cambio visible es
   `indicators-view` (sin hooks); la mayoría de la lista de la auditoría
   resultó falsos positivos (bottom-nav necesita usePathname para el estado
   activo; los wrappers de charts deben seguir client por recharts).

## Trazas

Las trazas DevTools de F0 corren contra `npm run dev` (TTFB dominado por la
compilación on-demand) — para los commits server-side de esta fase la métrica
honesta es la reducción de queries/rondas documentada arriba. La comparación
completa de trazas baseline → final se hace en F7 sobre el build de producción
(preview de Vercel), como manda el plan.
