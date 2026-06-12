# Revisión de producción · 00 — Línea base

> Capturada el 2026-06-11 (rama `chore/fase-0-preparacion`, main en `8f6e71b`).
> Máquina local (macOS, dev). Las trazas de rendimiento corren contra `npm run dev`
> con el usuario de prueba sintético `demo@sandbox.local` (sandbox local, cero
> datos reales). Los números de dev NO son comparables con producción en
> absoluto — sirven como base relativa para medir mejoras de la revisión.

## 1. Gate de calidad

| Check | Resultado |
|---|---|
| `npm run build` | ✅ exit 0 · **34.06 s** |
| `npm run lint` | ✅ 0 errores / 0 warnings de ESLint |
| `npx tsc --noEmit` | ✅ 0 errores |
| `npm run test` | ✅ 24 files passed, 1 skipped · **151 tests passed, 6 skipped** |

### Warnings detectados (verbatim, sin arreglar)

1. **Build + lint** — workspace root inferido por lockfile duplicado:
   ```
   ⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
   To silence this warning, set `outputFileTracingRoot` in your Next.js config,
   or consider removing one of the lockfiles if it's not needed.
   ```
   (Hay un `package-lock.json` fuera del proyecto que Next detecta.)
2. **Build** — `Found 1 warning while optimizing generated CSS:` apuntando a un
   bloque de comentario del módulo Transacciones en el CSS global (LightningCSS).
3. **Lint** — `next lint` está deprecado y se elimina en Next.js 16; migrar al
   ESLint CLI (`npx @next/codemod@canary next-lint-to-eslint-cli .`).
4. **Tests** — dos `warn` en stderr son salidas esperadas de los propios tests
   (auth-callback "code already used", rate-limit "excedido"); no son fallos.
5. **RLS** — `tests/rls/isolation.test.ts` skipped (requiere credenciales reales;
   comportamiento documentado en CLAUDE.md).

## 2. Métricas de código

| Métrica | Valor |
|---|---|
| Archivos `.ts` (src, sin tests) | 154 |
| Archivos `.tsx` (src) | 135 |
| Componentes/módulos `"use client"` | 77 |
| `dependencies` | 10 |
| `devDependencies` | 12 |
| Archivos de test | 25 |
| Migraciones SQL | 34 |

## 3. Build de producción — bundles por ruta

Tiempo total: **34.06 s** (real). First Load JS compartido: **102 kB**
(chunks 46 kB + 54.2 kB + 1.97 kB). Middleware: **90.3 kB**.

```
Route (app)                                 Size  First Load JS
┌ ○ /                                      208 B         102 kB
├ ○ /_not-found                            208 B         102 kB
├ ƒ /api/* (12 rutas)                      208 B         102 kB
├ ƒ /auth/callback                         208 B         102 kB
├ ƒ /bienvenida                          12.9 kB         122 kB
├ ƒ /configuracion                       6.65 kB         109 kB
├ ƒ /control-financiero                   6.1 kB         115 kB
├ ƒ /dashboard                           2.94 kB         213 kB
├ ƒ /deudas                              1.48 kB         239 kB
├ ƒ /deudas/[debtId]                     5.01 kB         221 kB
├ ƒ /gastos                                148 B         329 kB
├ ƒ /ingresos                              148 B         329 kB
├ ƒ /invitacion/aceptar                  1.08 kB         107 kB
├ ƒ /invitacion/nombre                   1.05 kB         103 kB
├ ƒ /login                               1.71 kB         107 kB
├ ƒ /mi-base-financiera                    147 B         329 kB
├ ƒ /mi-perfil-financiero                  167 B         106 kB
├ ƒ /mi-rich-life                        8.21 kB         215 kB
├ ƒ /patrimonio                          11.7 kB         246 kB
├ ƒ /patrimonio/indicadores              2.81 kB         261 kB
├ ƒ /patrimonio/proteccion               6.22 kB         115 kB
├ ○ /reset-password                      1.24 kB         107 kB
├ ○ /reset-password/nueva                1.22 kB         103 kB
├ ƒ /signup                              1.76 kB         107 kB
└ ƒ /transacciones                         147 B         329 kB
+ First Load JS shared by all             102 kB
ƒ Middleware                             90.3 kB
```

**Lectura rápida:** las 4 rutas del módulo Base Financiera (gastos, ingresos,
transacciones, mi-base-financiera) comparten el bundle más pesado (**329 kB**
First Load); siguen indicadores (261 kB), patrimonio (246 kB) y deudas (239 kB).
Candidatos primarios para code-splitting en fases siguientes.

## 4. Trazas de rendimiento (Chrome DevTools MCP · dev server, sin throttling)

| Página | LCP | · TTFB | · Render delay | CLS | Hallazgos del trace |
|---|---|---|---|---|---|
| /dashboard | **1 380 ms** | 679 ms | 700 ms | **0.00** | DocumentLatency (ahorro est. LCP −578 ms), RenderBlocking |
| /mi-base-financiera | **1 072 ms** | 480 ms | 592 ms | **0.00** | **ForcedReflow**, RenderBlocking |
| /patrimonio | **1 330 ms** | 545 ms | 784 ms | **0.00** | **ForcedReflow**, RenderBlocking |
| /control-financiero | **1 435 ms** | 548 ms | 887 ms | **0.00** | **ForcedReflow**, RenderBlocking |

Notas:
- **TBT**: los insights del trace no reportaron TBT/long-tasks destacables en
  estas cargas (sin interacción, CPU sin throttling); medirlo con throttling
  4× en la fase de optimización para tener señal útil.
- **CLS = 0.00 en las 4 páginas** — excelente, sin layout shifts.
- El patrón dominante es consistente: ~½ del LCP es TTFB del dev server
  (compilación on-demand de Next dev inflará esto; en prod será menor) y ~½ es
  render delay del cliente — ahí vive la oportunidad real (hidratación de 77
  componentes client, gráficos).
- **ForcedReflow aparece en 3 de 4 páginas** (las que tienen gráficos/medidores
  que leen geometría tras mutar el DOM) — candidato a investigación en la fase
  de rendimiento.

## 5. Cómo reproducir

```bash
npm run build          # tabla de bundles + tiempo (usar /usr/bin/time -p)
npm run lint && npx tsc --noEmit && npm run test
# Trazas: npm run dev + Chrome DevTools MCP (performance_start_trace con
# reload) sobre las 4 rutas, sesión demo@sandbox.local del sandbox local.
```
