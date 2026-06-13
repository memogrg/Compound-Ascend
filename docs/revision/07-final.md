# Revisión de producción · 07 — Verificación final

> 2026-06-13 · rama `chore/fase-7-verificacion`. Cierre de la revisión F0→F7.
> Baseline en `00-baseline.md` (tag `backup/pre-revision-2026-06-11`).

## Gate final (main + esta rama)

| Check | Resultado |
|---|---|
| `tsc --noEmit` | ✅ |
| `lint` | ✅ 0 warnings |
| `test` | ✅ **243 passed**, 6 skipped (eran 151 al inicio) |
| `build` | ✅ 39.7 s |
| `semgrep` (p/typescript,react,nextjs,secrets,owasp) | ✅ 1 INFO benigno (cookie @supabase/ssr) |
| `npm audit --omit=dev` | 2 moderate (postcss vía Next, build-time) — ver riesgo aceptado |

## Bundles: baseline → final (First Load JS)

| Ruta | Baseline | Final | Δ |
|---|---|---|---|
| /gastos · /ingresos · /transacciones · /mi-base-financiera | 329 kB | **215 kB** | **−35%** |
| /dashboard | 213 kB | **117 kB** | **−45%** |
| /patrimonio | 246 kB | **152 kB** | −38% |
| /patrimonio/indicadores | 261 kB | **146 kB** | −44% |
| /deudas | 239 kB | **127 kB** | −47% |
| /mi-rich-life | 215 kB | **148 kB** | −31% |
| First Load compartido | 102 kB | 102 kB | = |

Causa principal: recharts fuera del bundle inicial (`next/dynamic`).

## Core Web Vitals (Chrome DevTools, dev server)

| Página | LCP base | LCP final | CLS base | CLS final |
|---|---|---|---|---|
| /dashboard | 1380 ms | 1261 ms | 0.00 | **0.07** |
| /mi-base-financiera | 1072 ms | 1536 ms* | 0.00 | 0.00 |
| /patrimonio | 1330 ms | 1531 ms* | 0.00 | 0.03 |
| /control-financiero | 1435 ms | 1464 ms | 0.00 | 0.00 |

*Las trazas corren contra `npm run dev`: el TTFB lo domina la compilación
on-demand (750–860 ms), que NO existe en producción — por eso el LCP de dev es
ruidoso y no comparable entre corridas. El número fiable de mejora es el
**bundle** (arriba) y la reducción de queries por request (cache() + paralelo).
La comparación dura de LCP se hará sobre el preview de Vercel.

**Regresión menor honesta — CLS de dashboard 0.00 → 0.07** (sigue en banda
"buena" <0.1): la causa es el swap skeleton→chart de los charts diferidos, de
altura ligeramente distinta. Mitigación futura: fijar al skeleton la altura
exacta del chart. No bloquea deploy.

## Resumen por fase

- **F0** Baseline + tag de respaldo + CLAUDE.md al día.
- **F1** Auditoría: TOP 10 priorizado (sin hallazgos críticos; base de seguridad sana).
- **F2** Barrels completos + guardia ESLint (32 imports cross-módulo corregidos) + dedup + prettier (164 archivos).
- **F3** Fixes alto/medio: cron de snapshots reparado (nunca funcionó), market-price con auth, rate-limit en webhooks, CORS en assistant.
- **F4** Rendimiento: −35/−47% First Load, streaming, `React cache()`, timeout 6→3 s, índices compuestos en prod.
- **F5** UI/UX: foco de teclado, charts accesibles, 0 inputs sin label, tooltips de concepto.
- **F6** Tests 168→243 (portfolio-engine 0→100%), e2e smoke Playwright, CI con build + Dependabot + branch protection + secret scanning.
- **F7** Verificación final + bump de seguridad de nodemailer.

## Seguridad — estado

- nodemailer 6→8 (high de inyección SMTP/DoS resuelto).
- **Riesgo aceptado:** 2 moderate de `postcss` transitivas de Next (XSS en CSS
  stringify, **solo build-time**, no hay ruta de usuario). Se cierran al subir
  Next a un major futuro; `npm audit fix --force` rompería el build hoy.
- Push protection + secret scanning activos en el repo.

## Plan de despliegue (lo dispara el owner)

1. Mergear los PRs pendientes a main (CI verde obligatorio por branch protection).
2. **Migraciones a prod ya aplicadas** durante la revisión (índices F4 +
   household/interconexión/gastos). Verificar con:
   `select version from supabase_migrations.schema_migrations order by version desc limit 6;`
3. Vercel despliega automático al mergear a main. Revisar el build log del
   deployment en el dashboard de Vercel.
4. **Smoke post-deploy** (prod, con usuario real): login → dashboard carga →
   registrar un gasto vinculado a deuda → ver patrimonio. (Es el mismo flujo
   del e2e.)
5. **Rollback instantáneo:** Vercel → Deployments → el deployment anterior →
   "Promote to Production" (o "Instant Rollback"). Las migraciones son
   aditivas: el código anterior sigue funcionando sin revertir BD.

## Pendiente del owner (no bloqueante para esta fase)

- Rotar secretos que viajaron por chat: password BD prod, keys
  Gemini/Finnhub/AlphaVantage, token Semgrep.
- Sentry (observabilidad de errores en runtime): plan en
  `07-sentry-plan.md` — requiere tu OK e instalar variables en Vercel.
