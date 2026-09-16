# Informe técnico completo: stack de gráficos e interacción (Next.js 16, React 19, TS strict, Tailwind v4)

_Informe del 16-sep-2026 (subagente técnico; versiones/fechas/licencias del registro npm y páginas oficiales; tamaños de bundlephobia o medición propia con esbuild minify+gzip, React externo). La matriz y la recomendación están en el blueprint §12-14; este archivo conserva el detalle._

## A.1 Estado verificado (npm, 16-sep-2026)

| Librería | Latest | Fecha | Licencia | Render | Tamaño gz |
|---|---|---|---|---|---|
| Apache ECharts | 6.1.0 | 2026-05-19 (6.0.0: 2025-07-30) | Apache-2.0 | Canvas/SVG (+SSR SVG) | 380 kB completo; **198 kB** modular (línea+grid+tooltip+dataZoom+markLine+aria+canvas) |
| echarts-for-react | 3.0.6 | 2026-01-21 | MIT | wrapper | peer echarts ^3‖^4‖^5‖^6 |
| Highcharts / @highcharts/react | 13.0.2 / 5.3.0 | 2026-08-27 | Comercial (EULA) | SVG | no verificado |
| Recharts | 3.10.1 (canary 3.11) | 2026-07-25 | MIT | SVG | 151 kB completo; **111 kB** AreaChart+ejes+Tooltip+Brush+ResponsiveContainer (arrastra redux-toolkit, immer, es-toolkit) |
| D3 | 7.9.0 | 2024-03-12 | ISC | DIY | 92 kB completo |
| visx | 4.0.0 | 2026-06-11 (v3.12: nov-2024) | MIT | SVG | xychart 61 kB; primitivas shape+curve+scale+tooltip **20,5 kB** |
| Nivo | 0.99.0 | 2025-05-23 | MIT | SVG/Canvas/HTML | no verificado |
| Plotly.js / react-plotly.js | 4.1.1 / 4.1.0 | 2026-09-14 / 2026-07-29 | MIT | SVG+WebGL | **1,40 MB** |
| uPlot | 1.6.32 | 2025-03-14 | MIT | Canvas | 21,9 kB |
| Chart.js / react-chartjs-2 | 4.5.1 / 5.3.1 | 2025-10 | MIT | Canvas | 68 kB |
| Observable Plot | 0.6.17 | 2025-02-14 | ISC | SVG | 128 kB |
| @tremor/react | 3.18.7 | 2025-01-13 | Apache-2.0 | Recharts | — |
| shadcn `chart` | CLI 4.21.0 | 2026-09-04 | MIT | Recharts v3 | = Recharts |
| Unovis | 1.7.0 | 2026-09-10 | Apache-2.0 | no verificado | no verificado |
| Vega-Lite / react-vega | 6.4.3 / 8.0.0 | 2026-04-24 / 2025-08-27 | BSD-3 | Canvas/SVG | pesado |
| AG Charts Community | 14.2.0 | 2026-09-16 | MIT (+Enterprise) | Canvas | no verificado |
| MUI X Charts | 9.13.0 | 2026-09-04 | MIT (+Pro) | SVG | no verificado |
| ApexCharts | 7.4.0 | 2026-09-15 | Comercial > USD 2 M | SVG | — |
| LightningChart / SciChart | 9.0.0 / 5.2.69 | 2026-08 / 2026-09 | Comercial | WebGL | — |

Hechos: ECharts 6 (tema por tokens, cambio de tema en caliente, dark mode del sistema, ejes con quiebre, matrix, chord, beeswarm, custom series npm; SSR `init(null,null,{renderer:'svg',ssr:true})` → `renderToSVGString()`; runtime cliente <4 KB con hidratación limitada). Recharts 3 (`accessibilityLayer` por defecto, tooltip en portal, `YAxis width="auto"`, hooks `useActiveTooltipDataPoints`/`useChartLayout`, animaciones personalizables 3.9, theming experimental 3.11; VoiceOver exige desactivar QuickNav). shadcn chart usa Recharts v3 con `var(--chart-n)` y exige altura en `ChartContainer`. visx 4.0 tras 19 meses sin release (React 18/19, ESM, sin lodash/prop-types). Nivo sin releases desde mayo 2025. Tremor adquirido por Vercel (ene 2025), npm sin publicar desde entonces. Highcharts EULA: uso personal/educativo gratis; negocio requiere licencia; SaaS público requiere tier SaaS (Core USD 366/puesto). AG Charts Community: crosshair, navigator, zoom, sync, Sankey, treemap, sunburst, heatmap = Enterprise. ApexCharts: gratis < USD 2 M/año, si no desde USD 199/dev/año. uPlot: 166 k puntos en 25 ms, sin tooltips/animación/stacking, 131 issues, un mantenedor. Ningún «newcomer» 2025-2026 verificable.

## A.2 Next.js 16 App Router
Todas las interactivas requieren `"use client"`. Recharts y visx renderizan SVG en SSR (Client Component hoja con altura fija; `ResponsiveContainer` mide en cliente). ECharts necesita DOM: `next/dynamic(() => import(...), { ssr:false, loading: Skeleton })` dentro de un Client Component (en Next 15+ `ssr:false` no va en Server Components); alternativa `renderToSVGString` para estáticos (correos/PDF). Highcharts, Plotly, uPlot, Chart.js: client-only.

## A.3 Matriz ponderada
Pesos: React/Next 10 · visual 13 · interacción 14 · 10k+ 8 · bundle 8 · a11y 10 · tema 7 · TS 7 · mantenimiento 10 · licencia 8 · simplicidad 5. Resultados: Highcharts 82,8 · **ECharts 81,0** · **Recharts+shadcn+SVG 80,4** · visx 78,0 · MUI X 73,4 · Unovis 73,0 · D3 71,8 · AG Charts 71,0 · Tremor 68,2 · Nivo 67,4 · Chart.js 63,4 · Plotly 62,2 · Vega-Lite 60,8 · uPlot 56,6 · Plot 55,4. (MUI X, Unovis y AG Charts: a11y/bundle/zoom parcialmente por conocimiento previo, no verificados.)

Riesgos del híbrido: dos sistemas de tema (leer `getComputedStyle` y `setTheme` al cambiar `data-theme`); a11y de ECharts más pobre (`aria` genera descripción y decals; teclado no documentado → tabla alternativa); ~200 kB gz extra solo en rutas analíticas.

## A.4 Visuales premium — ganchos concretos

**Recharts 3 (vía shadcn ChartContainer)**
```tsx
<AreaChart data={d} accessibilityLayer syncId="finanzas">
  <defs>
    <linearGradient id="gIngreso" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="var(--color-ingreso)" stopOpacity={0.28}/>
      <stop offset="95%" stopColor="var(--color-ingreso)" stopOpacity={0}/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <Area type="monotone" dataKey="ingreso" stroke="var(--color-ingreso)" strokeWidth={2}
        fill="url(#gIngreso)" strokeOpacity={activa && activa!=='ingreso' ? 0.3 : 1}
        activeDot={{ r: 4, filter: 'url(#glow)', strokeWidth: 0 }}
        animationDuration={400} animationEasing="ease-out"/>
  <Tooltip cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} content={<ChartTooltipContent/>}/>
  <Brush dataKey="mes" height={24} travellerWidth={8}/>
  <ReferenceLine y={meta} strokeDasharray="4 4" label="Meta"/>
</AreaChart>
```
`syncId` sincroniza también el Brush; atenuar series con estado desde `Legend onMouseEnter/Leave`; sin zoom con rueda/pinch; >5 k puntos degrada; Sankey/Treemap/Sunburst existen; no hay heatmap-calendario; z-order = orden de render (Tooltip y ReferenceLine al final).

**ECharts 6**
```ts
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, AriaComponent } from 'echarts/components';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, AriaComponent, UniversalTransition, CanvasRenderer]);
const option = {
  aria: { enabled: true, decal: { show: true } }, // confirmar nombre exacto (aria.enabled vs aria.show)
  tooltip: { trigger: 'axis', axisPointer: { type: 'cross', lineStyle: { type: 'dashed', opacity: .5 } },
             className: 'ca-tooltip', confine: true, formatter: fmtHtmlEscapado },
  dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20 }],
  series: [{ type: 'line', smooth: true, smoothMonotone: 'x', showSymbol: false, sampling: 'lttb',
    lineStyle: { width: 2 },
    areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1,
      [{ offset: 0, color: 'rgba(55,132,81,.28)' }, { offset: 1, color: 'rgba(55,132,81,0)' }]) },
    emphasis: { focus: 'series', itemStyle: { shadowBlur: 12, shadowColor: 'rgba(55,132,81,.6)' } },
    blur: { lineStyle: { opacity: .3 }, areaStyle: { opacity: .05 } },
    markLine: { symbol: 'none', data: [{ yAxis: meta, name: 'Meta' }] },
    universalTransition: true, animationDuration: 400, animationEasing: 'cubicOut' }],
};
chart.group = 'finanzas'; echarts.connect('finanzas');
```
Confirmado en docs: `axisPointer.type` ∈ line|shadow|cross|none; `tooltip.formatter` acepta HTML pero exige escapar (XSS); `appendTo`/`confine`; `echarts.connect`; `init` con `renderer`, `ssr` (solo SVG), `useDirtyRect`; `axisPointer.link`. Tipos: Sankey, treemap, sunburst (drill-down), calendar heatmap, graph, chord.

**visx 4 (héroe)**: `@visx/shape` (`AreaClosed`, `LinePath` con `curveMonotoneX`), `@visx/gradient`, `@visx/glyph` + filtro SVG, `@visx/tooltip` (`useTooltip`, `TooltipWithBounds`), `@visx/brush`, `@visx/annotation`, `@visx/sankey`, `@visx/hierarchy`, `@visx/heatmap`; `@visx/xychart` con crosshair incluido (61 kB). Toda la a11y/teclado/enlace es trabajo propio.

## A.5 Tipos especiales
| | Sankey | Treemap | Heatmap-calendario | Sunburst |
|---|---|---|---|---|
| ECharts | Sí | Sí (drill) | Sí | Sí |
| Recharts 3 | Sí | Sí | No | Sí |
| visx 4 | Sí | Sí | Manual | Manual |
| Highcharts | Módulo | Sí | Heatmap | Sí |
| Nivo | Sí | Sí | Sí | Sí |
| Plotly | Sí | Sí | No | Sí |
| AG Charts | Enterprise | Enterprise | Enterprise | Enterprise |
| Chart.js | Plugins | Plugin | Plugin matrix | No |

## A.6 10 k+ puntos
Agregar en RSC; Recharts SVG con ≤ cientos de puntos; ECharts Canvas + `lttb` + dataZoom; uPlot/WebGL solo para streaming en tiempo real (no aplica).

## B. Stack de interacción
| Pieza | Versión | Tamaño | Veredicto |
|---|---|---|---|
| Motion (`motion/react`) | 13.4.0 (v13: 5-ago-2026) | 47,7 kB; LazyMotion+domAnimation+m **29,9 kB** | Recomendado con `LazyMotion`+`m`; v13 solo quitó `@emotion/is-prop-valid` |
| CSS/WAAPI | nativo | 0 | Por defecto (Vercel: CSS → WAAPI → JS; animar transform/opacity; nunca `transition: all`) |
| GSAP + @gsap/react | 3.15.0 / 2.1.2 | 27,4 kB | Evitar (gratis, pero no aporta sobre Motion) |
| React Spring | 10.1.2 | — | Evitar como dependencia propia |
| shadcn/ui | CLI 4.21.0 | copy-paste | Recomendado; Base UI default desde jul-2026 pero Radix sigue soportado (`-b radix`); paquete `radix-ui` 1.6.7 |
| Base UI | 1.8.0 | — | Aceptable para componentes nuevos; no migrar |
| React Aria Components | 1.21.1 | — | Puntual (DateRangePicker i18n, grids) |
| TanStack Table | 9.2.4 (v9 estable 4-ago-2026) | tree-shakeable | Recomendado para código nuevo; compatible con React Compiler |
| TanStack Virtual | 3.14.13 | — | Recomendado (>500 filas) |
| TanStack Query | 5.103.1 | — | Evitar por defecto en RSC; nunca Server Actions en `queryFn` |
| cmdk | 1.1.1 (mar-2025) | 14,9 kB | Recomendado con reservas (estable, poca actividad) |
| react-day-picker | 10.0.1 | 19,3 kB | Recomendado (rango, locale es, TZ con @date-fns/tz, WCAG 2.1 AA) |
| react-countup | 6.5.3 (2024) | 4,3 kB | Evitar |
| NumberFlow (`@number-flow/react`) | 0.6.2, MIT | — | Recomendado (Intl, reduced motion, CSP nonce) |
| nuqs | 2.10.1 | — | Recomendado (`createSearchParamsCache`, `NuqsAdapter`) |
| Zustand | 5.0.15 | 0,5 kB | Solo estado efímero entre gráficos |
| Jotai | 3.0.0 (sep-2026) | — | Evitar por ahora (recién salida, solo ESM) |

**Intl es-CR (Node 22.22, ICU 78.2):** `₡1 234 567,89` · sin decimales `₡1 234 568` · compact `₡1,2 M` · USD `USD 1 234,50` (usar `currencyDisplay:'narrowSymbol'` para `$`, no verificado) · `signDisplay:'exceptZero'` → `-₡2 500,00`. Separador de miles U+00A0. Riesgo de hidratación si ICU difiere: formatear en servidor o normalizar con `formatToParts`; tests no comparan con espacio normal.

**Motion (M3 tokens):** short 50/100/150/200 ms; medium 250/300/350/400 (300 el más común); long 450-600; extra long 700-1000. Easing: emphasized (0.2,0,0,1); decelerate (0.05,0.7,0.1,1); accelerate (0.3,0,0.8,0.15); standard (0,0,0,1)/(0.3,0,1,1). Apple HIG sin cifras verificables. Vercel: reduced motion, interrumpibles, >5 s con pausa, transform/opacity, `transform-box: fill-box` en SVG. WCAG 2.3.3 es AAA. web.dev: reducir, no eliminar. Motion `<MotionConfig reducedMotion="user">` quita transform/layout y conserva opacity/color. Presupuesto propuesto: tooltip/crosshair 100-150; hover 150-200; datos 300-400; rango/drill 400-500; KPIs ≤ 600.

## C. Verificación
Playwright 1.63.0 `toHaveScreenshot()` (bases por navegador+SO, generar en CI, `animations:'disabled'`, `mask`, `maxDiffPixels`, fijar `devicePixelRatio` en Canvas); Next 16.3 `@next/playwright` con `instant()`; `@axe-core/playwright` 4.13.0 (MPL-2.0; no cubre navegación con flechas → test propio); Lighthouse CI 0.15.1 (jun-2025, >14 meses sin release; no bloqueante); React Compiler estable en Next 16 pero apagado (`reactCompiler: true`, Babel; 16.3 añade `experimental.turbopackRustReactCompiler`); bundle: `npx next experimental-analyze --output` (Turbopack), `@next/bundle-analyzer` solo webpack; Node ≥ 20.9.

## Plan de adopción sugerido
1. `feat/charts-premium-recharts`: `<GradientDefs>`, `<GlowFilter>`, `<ChartTooltipCR>`, `useSerieActiva`. Solo UI.
2. `feat/echarts-patrimonio`: wrapper modular con tema desde CSS vars, `dynamic`, ResizeObserver, dispose, reduced motion; primer caso histórico de patrimonio + tabla accesible.
3. `feat/sankey-flujo-caja`, `feat/heatmap-gastos`.
4. `chore/visual-regression-charts`: `toHaveScreenshot` + axe por ruta + diff de `experimental-analyze` en CI.

## Fuentes abiertas
ui.shadcn.com (changelog 2026-07 base-ui-default, components/chart); highcharts.com (EULA blog, shop, accessibility-module; /react devolvió 404); echarts.apache.org (v6-feature, import, aria, cross-platform/server, option axisPointer/tooltip, api, llms.txt); github.com/apache/echarts/releases; gsap.com/community/standard-license; github.com/recharts/recharts (releases, wiki a11y, 3.0 migration, src/index.ts); recharts.github.io/en-US/api/Brush; nextjs.org/blog/next-16, next-16-3, docs package-bundling; github.com/airbnb/visx/releases; github.com/plouc/nivo/releases; vercel.com/blog/vercel-acquires-tremor; tanstack.com (announcing-table-v9, query advanced-ssr); motion.dev (react-upgrade-guide, react-accessibility); infoq.com (jotai-3); m3.material.io motion tokens (JS; transcripción secundaria); developer.apple.com HIG motion (JS); web.dev/articles/prefers-reduced-motion; w3.org WCAG22 animation-from-interactions; vercel.com/design/guidelines; nuqs.dev (adapters, server-side); daypicker.dev; github.com/pacocoursey/cmdk; playwright.dev (test-snapshots, accessibility-testing); github.com/GoogleChrome/lighthouse-ci/releases; github.com/leeoniya/uPlot; github.com/chartjs/Chart.js/releases; unovis.dev; github.com/observablehq/plot/releases; github.com/d3/d3/releases; blog.logrocket.com/best-react-chart-libraries-2026; ag-grid.com/charts/react/community-vs-enterprise; lightningchart.com/js-charts/pricing; apexcharts.com/blog/new-licencing-model; base-ui.com releases; react-spectrum.adobe.com/releases; number-flow.barvian.me; registry.npmjs.org y bundlephobia.com/api/size para cada paquete.
