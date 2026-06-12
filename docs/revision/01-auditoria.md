# Revisión de producción · 01 — Auditoría (solo lectura)

> 2026-06-11 · rama `chore/fase-1-auditoria` · main en `ea87e91`.
> Herramientas: 3 agentes de exploración (acciones, rendimiento, calidad) + semgrep
> (p/typescript, p/react, p/nextjs, p/secrets) + inspección directa del esquema
> (sandbox local = mismas 34 migraciones que prod) + greps dirigidos.
> **Nada fue modificado.** Severidades: crítico / alto / medio / bajo.

## Resumen ejecutivo

| Área | Estado | Hallazgos |
|---|---|---|
| Validación + auth de Server Actions | ✅ Excelente | 57/57 acciones con Zod + auth; 0 huecos |
| Aislamiento del cliente service-role | ✅ Correcto | 12 usos, todos en webhooks/crons verificados |
| RLS | ✅ Completo | 0 tablas sin RLS; 4 políticas `true` son tablas de referencia global de solo lectura (por diseño) |
| Type-safety | ✅ Limpio | 0 `any`/`@ts-ignore`; 1 eslint-disable justificado |
| Código muerto | ✅ Limpio | 0 exports muertos de alta confianza |
| Semgrep | ✅ Casi limpio | 3 hallazgos, los 3 benignos (ver bajo) |
| **Regla de barrels** | ⚠️ Rota | **31 imports profundos cross-módulo en 11 archivos** |
| **API routes** | ⚠️ Huecos | Cron de snapshot roto; market-price sin auth; inconsistencias menores |
| **Rendimiento (estático)** | ⚠️ Oportunidades grandes | Sin cache() de React, precios secuenciales, recharts eager, 0 Suspense |

---

## 1. CALIDAD

### ALTO — Regla de barrels violada sistémicamente
**31 imports profundos cross-módulo en 11 archivos.** CLAUDE.md exige importar solo
desde `module/index.ts`, pero el barrel de `financial-base` no exporta lo que los
demás módulos necesitan (`linked-transaction-service`, `engine/linked`,
`engine/health`, `transaction-service`), así que todos importan rutas internas.
Ejemplos: `control/services/control-service.ts:7-17`,
`wealth/services/holdings-service.ts` (linked-transaction-service + engine/linked),
`rich-life/services/rich-life-service.ts` (base-service + wealth/engine +
portfolio-service), `dashboard/services/dashboard-service.ts` (3 imports profundos).
**Impacto:** acoplamiento sin contrato; cualquier refactor interno de financial-base
rompe 6 módulos. **Arreglo (Fase 2):** completar el barrel de financial-base (y el de
wealth), corregir los 31 imports, y añadir regla ESLint `no-restricted-imports` para
que no regrese.

### BAJO — Manejo de errores
- `wealth/components/add-holding-wizard.tsx:366` — `.catch(() => {})` silencioso en
  fetch opcional de país (cliente). Arreglo: log con `logger.warn` o comentario de
  intencionalidad.
- Patrón general correcto: `lib/errors.ts` (AppError/toSafeResponse) + `lib/logger.ts`
  (JSON estructurado con redacción de secretos) usados consistentemente en actions.

### MEDIO — Duplicación
- `formatMoney` duplicado: `lib/format.ts` (Intl.NumberFormat, 31+ usos) vs
  `lib/whatsapp/format.ts` (toLocaleString, mismo mapa de 7 símbolos). Decisión a
  tomar en Fase 2: aislar WhatsApp a propósito (documentarlo) o re-exportar de lib.
- Mapas de símbolos de moneda (`SYM`) re-declarados en ≥3 componentes
  (budget-warning-modal, add-spend-modal/jar-normal-modal, currency-switch) — unificar
  en `lib/format.ts` es mecánico.

---

## 2. SEGURIDAD

### ALTO — `/api/investments/snapshot` (route.ts:32-55): el modo cron está roto
El endpoint acepta `X-Cron-Secret` y extrae `body.userId`, pero después llama
servicios (`getPortfolioReport`, `getRichLifeSummary`) que internamente hacen
`requireUser()` → en contexto cron (sin sesión) **falla siempre**. Además `userId`
no se valida como UUID (medio: llega crudo al upsert; parametrizado por supabase-js,
sin riesgo de inyección, pero produce errores opacos).
**Arreglo (Fase 3):** refactor de los servicios para aceptar `userId` explícito en
modo cron (mismo patrón que `base/snapshot`) + `z.string().uuid()` sobre el body.

### ALTO — `/api/market-price` y `/api/market-price/search` sin autenticación
Solo rate-limit por IP. Proxyean APIs externas con **nuestros tokens**
(Finnhub/AlphaVantage) → cualquier anónimo puede quemar la cuota.
**Arreglo (Fase 3):** exigir usuario autenticado (o al menos rate-limit por usuario
cuando hay sesión y mucho más estricto para anónimos).

### MEDIO
- `/api/base/snapshot` verifica solo el header `x-cron-secret`; los otros 3 crons
  aceptan también `Authorization: Bearer` — unificar el helper.
- Webhooks (`payment`, `whatsapp`) sin rate-limit propio: la verificación de firma es
  fuerte, pero permite intentos ilimitados (CPU). Añadir `rateLimit` por IP.

### BAJO
- `assistant/chat` y `scan-receipt` validan origen (`assertTrustedOrigin`) pero no
  emiten headers CORS en la respuesta de éxito — irrelevante en uso same-origin,
  inconsistente si algún día se consume cross-origin.
- semgrep: `components/ui/icon.tsx:102` `dangerouslySetInnerHTML={{__html: PATHS[name]}}`
  — **falso positivo práctico**: `PATHS` es un mapa constante interno tipado
  (`Record<IconName, string>`), sin entrada de usuario. Arreglo: comentario
  `// nosemgrep` con justificación.
- semgrep INFO: cookie SameSite en `lib/supabase/middleware.ts:40` — patrón estándar
  de @supabase/ssr; sin acción.
- **No se encontraron secretos expuestos en el código** (p/secrets limpio).

---

## 3. BASE DE DATOS (esquema real, 34 migraciones)

### ✅ Sin hallazgos críticos
- **0 tablas públicas sin RLS.** Las 4 políticas con `qual=true` (currencies,
  economic_indicators, fx_rates, market_price_cache) son lectura de datos de
  referencia globales sin `user_id` — correcto por diseño (documentado en CLAUDE.md).
- Cobertura de índices buena: `transactions` (user, occurred, linked, household),
  `budget_items` (period, user, source, household + únicos anti-duplicado),
  `debt_payments` (debt, txn, user, household).

### MEDIO — Índice compuesto propuesto (NO aplicar en esta fase)
La consulta más caliente filtra `user_id + occurred_on BETWEEN` (transacciones del
mes). Hoy hay índices separados; un compuesto la sirve directo:
```sql
-- Propuesta Fase 4 (revisar EXPLAIN antes):
create index if not exists idx_transactions_user_occurred
  on public.transactions (user_id, occurred_on desc);
```
Análogo candidato: `budget_items (user_id, period_year, period_month)`.

### N+1 — no se encontró el patrón clásico de queries en loop hacia Postgres;
el "N+1" real del sistema es hacia **proveedores de precios** (ver Rendimiento).

---

## 4. RENDIMIENTO (estático; medición real en Fase 4)

### ALTO — Fetches repetidos sin `React cache()`
`getBaseSummary()` se llama 4× por request (base-view, dashboard, control,
rich-life); `getFxRates()` 5×; `getDisplayCurrency()` 4×. Envolver en `cache()` de
React es 3 líneas y elimina decenas de queries duplicadas por render.

### ALTO — Precios de mercado secuenciales (`portfolio-service.ts:40-62, 91-147`)
`fetchNormalizedPrices` itera holdings llamando `getMarketPrice` uno a uno; cada
proveedor tiene timeout 6s y el fallback es secuencial (peor caso 18s/símbolo,
60s con 10 holdings fríos). **Arreglo (Fase 4):** `Promise.all` sobre los símbolos +
fallback a `average_cost` si el precio falla + considerar timeout 3s.

### ALTO — recharts eager en las rutas más pesadas
Los wrappers de charts son `"use client"` e importados estáticamente en
`financial-base/components/v2/sections.tsx:9-10`, dashboard-view, portfolio-view,
rich-life-dashboard y debts-view → recharts entra en el First Load de las rutas de
329/246/239/213 kB. **Arreglo (Fase 4):** `next/dynamic` para los charts bajo el fold.

### MEDIO — 0 boundaries de Suspense en las 5 páginas principales
Todo el data-fetching bloquea el primer byte de UI. Streaming con skeletons del
design system (dashboard y patrimonio primero) — marcado [GRANDE] en el plan.

### MEDIO — 16 de 77 componentes "use client" convertibles a Server Components
Lista completa en el apéndice del informe del agente; los de mayor valor:
`components/charts/line-chart.tsx` y `donut-chart.tsx` (sin hooks — son wrappers
puros), `auth/sign-out-button.tsx` (form con server action), `layout/bottom-nav.tsx`
(solo usePathname → prop). Uno por commit en Fase 4.

---

## 5. CONSISTENCIA / UI

- **BAJO** — 2 componentes con inputs sin label asociado: `csv-import-modal.tsx`
  (input file) y `scan-receipt-button.tsx`. Resto de inputs revisados tienen
  label/aria.
- `<img>` sin `alt`: 0.
- Texto en español: sin hallazgos en greps dirigidos (revisión visual completa por
  pantalla queda para Fase 5, como manda el plan).
- aria en charts de recharts: pendiente Fase 5.
- Limpiezas del baseline que siguen abiertas: lockfile duplicado (warning de
  workspace root), warning CSS del build (comentario en sección Transacciones),
  `next lint` deprecado, `revalidatePath("/ahorro")` fantasma.

---

## TOP 10 priorizado (impacto × esfuerzo)

| # | Hallazgo | Sev | Fase | Esfuerzo |
|---|---|---|---|---|
| 1 | `React cache()` en getBaseSummary/getFxRates/getDisplayCurrency | alto | F4 | XS |
| 2 | Batch de precios en portfolio-service (elimina peor caso 60 s) | alto | F4 | S |
| 3 | Cron de `/api/investments/snapshot` roto + validar userId UUID | alto | F3 | S |
| 4 | `next/dynamic` para recharts en 5 vistas (First Load 329→) | alto | F4 | S |
| 5 | Completar barrels + corregir 31 imports + regla ESLint | alto | F2 | M |
| 6 | Auth/rate-limit por usuario en `/api/market-price*` | alto | F3 | S |
| 7 | Suspense + skeletons en dashboard y patrimonio [GRANDE] | medio | F4 | M |
| 8 | Convertir 16 "use client" a Server Components | medio | F4 | M |
| 9 | Índice compuesto `transactions(user_id, occurred_on)` [SQL arriba] | medio | F4 | XS |
| 10 | Pack de menores: Bearer fallback en base/snapshot, rate-limit webhooks, CORS en assistant, catch silencioso, SYM duplicado, nosemgrep en icon, labels a11y | medio | F2/F3 | S |

**Sin hallazgos críticos bloqueantes.** La base de seguridad (RLS, Zod, auth,
service-role) está sana; el grueso del valor está en rendimiento (F4) y en
restaurar la disciplina de barrels (F2).
