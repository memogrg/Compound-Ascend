# CARTERA+ · Rediseño UX — Decisión tecnológica y herramientas

_Extraído del blueprint maestro (16-sep-2026). Fuente viva: https://claude.ai/code/artifact/0e037de8-78ec-44fd-b4ef-3ea701eea331_

## 18. Skills / plugins / MCP / tools audit

Inventario de lo que existe hoy en este entorno de Cowork y en el Mac, verificado por uso en esta sesión o por su presencia en el repo. Nada de esta tabla es hipotético; lo «recomendado» son dependencias de desarrollo que se instalan con un comando y se explican antes de agregarse.

| Capacidad | Disponible | Propósito | Dónde se usa en este proyecto | Valor | Costo | Recomendación |
| --- | --- | --- | --- | --- | --- | --- |
| Shell en el Mac (desktop-commander `start_process`) | **Ahora** | `next dev/build`, `vitest`, Playwright, git real | Verificación de cada delta; capturas por breakpoint | Alto | 0 | Usar; es la única shell donde corre `next build` |
| Shell VM con la carpeta montada (`device_bash`) | **Ahora** | Leer/editar archivos, `tsc`, `eslint`, `prettier` | Auditoría y prompts delta | Alto | 0 | Usar; no para build ni tests (binarios darwin) |
| Claude en Chrome | **Ahora** | Navegar prod y `localhost`, capturas, `javascript_tool` para medir DOM | Estado actual y revisión visual tras cada implementación | Alto | 0 | Usar; requiere que Memo inicie sesión |
| Navegador integrado de Cowork | **Ahora** | Igual que Chrome, aislado | Alternativa cuando Chrome no está | Medio | 0 | Reserva |
| Artifacts (páginas HTML publicadas) | **Ahora** | Prototipos A/B/C interactivos con datos de la cuenta demo, Recharts/ECharts por CDN | **El mecanismo de aprobación visual de cada pantalla** | Muy alto | 0 | Usar como estándar del proceso de diseño |
| Claude Docs | **Ahora** | Este blueprint, decision log, progreso | Documentación viva con comentarios | Alto | 0 | Usar |
| Subagentes (Agent) | **Ahora** | Investigación paralela, verificación adversarial | Ya usado (2 informes); verificación de prompts delta | Alto | Tokens | Usar en investigación y QA, no en tareas triviales |
| WebSearch / WebFetch / Tavily / TinyFish | **Ahora** | Verificar APIs, versiones, licencias | Ya usado | Alto | 0 | Usar |
| Skill `dataviz` | **Ahora** | Reglas de forma, paleta, marcas, interacción de gráficos | Antes de cada prototipo con gráficos | Alto | 0 | Cargar en cada pantalla |
| Skills `design:design-critique`, `design:accessibility-review`, `design:design-system` | **Ahora** | Crítica estructurada, revisión a11y, documentación del DS | Paso 6 (comparación) y paso 12 (aceptación) | Medio-alto | 0 | Usar en cada pantalla |
| Skill `engineering:code-review`, `engineering:testing-strategy` | **Ahora** | Revisión de PRs y plan de pruebas | Antes de cada merge | Medio | 0 | Usar |
| Playwright (`@playwright/test` en devDeps, `tests/e2e/smoke.spec.ts`) | **Ahora** | Capturas por breakpoint, `toHaveScreenshot`, `instant()` de Next 16.3 | Regresión visual de gráficos y pantallas | Alto | Bajo | Agregar specs; generar bases en CI, no en el Mac |
| Vitest (309 archivos de test) | **Ahora** | Unit, RLS, evals | Fórmulas nuevas (libre para gastar, estados de meta, TWR) | Alto | 0 | Exigir test por fórmula |
| Supabase MCP (proyecto `llaqonigsazoieyfhdea`) | **Ahora** | SQL de lectura contra prod/demo, advisors, logs | Datos reales para prototipos; diagnosticar el +57 % | Alto | 0 | Solo lectura durante el rediseño |
| Vercel MCP | **Ahora** | Deployments, build logs, runtime errors, web analytics | Ver qué rutas se usan más (prioridad) y validar builds | Medio | 0 | Usar |
| Sentry MCP | **Ahora** | Errores en prod | Detectar regresiones tras cada pantalla | Medio | 0 | Usar |
| Figma (skills `figma-generate-design`, `figma-use`) | Skills presentes; acceso a Figma no verificado | Mockups editables | Solo si Memo quiere iterar en Figma en vez de HTML | Bajo aquí | Cuenta Figma | **No necesario**: los prototipos HTML con datos reales son más fieles |
| Canva, Unsplash, Postiz, Wix, Sanity, SEO, Noibu, Odoo, Gmail, Calendar, Drive | Presentes | Marketing, contenido, otros proyectos | Ninguno en este rediseño | — | — | **No necesario** |
| GitHub (`gh`) desde la VM / contenedor | **No** (403; sin llavero) | Push, PR | Los push y PR los hace Memo o Claude Code en el Mac | — | — | Mantener el flujo actual |
| `@axe-core/playwright` | **Recomendado agregar** | Auditoría WCAG automática por ruta | Paso 12 de cada pantalla | Alto | `npm i -D`, MPL-2.0 | Agregar en la fase de fundamentos |
| `next experimental-analyze` (Next 16.1+) | **Ahora** (built-in) | Ver qué chunk carga qué | Presupuesto de peso por ruta | Alto | 0 | Usar; `@next/bundle-analyzer` solo sirve con webpack |
| Lighthouse CI | Opcional | TBT/LCP por ruta | Job no bloqueante | Medio | Bajo; último release jun-2025 | Opcional |
| React Compiler (`reactCompiler: true`, estable en Next 16) | Disponible, apagado | Memoización automática | Fase de rendimiento, tras verificar Recharts/ECharts | Medio | Build más lento | P3, activar por anotación |
| Storybook / Chromatic | **No instalado** | Catálogo de componentes | Sería útil para las 8 primitivas | Medio | Alto (setup + CI) | **No necesario ahora**; una página interna `/dev/ui` con las primitivas cumple el 80 % |

**Flujo de trabajo resultante por pantalla:** prototipos A/B/C como Artifacts con datos de la cuenta demo (Supabase MCP, solo lectura) → Memo elige y combina → prompt delta a Claude Code (rama `feat/...`) → `next dev -p 3111` en el Mac → revisión en Chrome + capturas Playwright a 390 / 768 / 1280 px → axe + `toHaveScreenshot` → crítica con `design-critique` → correcciones → PR.



## 20. Performance plan

El objetivo es que ninguna pantalla se sienta más lenta después del rediseño aunque tenga más gráficos: se agrega en el servidor, se pinta el esqueleto en el primer byte, y el peso analítico solo viaja a las rutas que lo usan.

| Área | Situación verificada | Plan | Presupuesto |
| --- | --- | --- | --- |
| Carga de datos | RSC con `Suspense` y skeletons por página (`DashboardContent`); varios `await` en serie en `dashboard/page.tsx` (`ensureRecurringIncome` → `getDashboardData` → `ensureMonthlyContributions` → `getActiveInsights` → `getSetupProgress`) | Paralelizar con `Promise.all` lo independiente; mover `ensure*` a un cron o al final de la respuesta | TTFB del Home < 600 ms p75 |
| Agregación | Series mensuales calculadas en servicios; algunas pantallas agregan en cliente | Todo agregado (mensual, por sobre, por comercio, TWR) se calcula en RSC o en SQL; el cliente recibe ≤ 400 puntos por gráfico; históricos diarios de precios con `lttb` | Payload RSC por pantalla < 60 kB |
| Bundle | Recharts ya sale del First Load con `lazy.tsx` (`ssr: false`, con flash de skeleton) | Recharts pasa a SSR real en un Client Component hoja (evita el flash); ECharts sí va con `dynamic` solo en 4 rutas; una sola librería de iconos | JS cliente por ruta < 250 kB gz; Home sin `echarts` |
| Render | `isAnimationActive={false}` como parche; SVG a mano en 37 archivos | Animación de 400 ms con `transform/opacity`; ECharts en Canvas con `useDirtyRect`; `ResizeObserver` con debounce 100 ms | 60 fps en hover/crosshair; sin re-render de la tabla al mover el cursor |
| Re-renders | Estado de filtros en URL vía `router.push` (re-render de página completa) | `nuqs` con `shallow` para filtros locales; estado de hover/serie activa en Zustand efímero fuera del árbol de datos; `React.memo` en tarjetas de gráfico; evaluar React Compiler por anotación al final | Cambio de filtro local < 100 ms sin ida al servidor cuando el dato ya está |
| Caché | Market-data e indicadores en memoria por instancia; Redis solo para rate-limit | Cache de precios y FX en Upstash (ya conectado) para que dos instancias no consulten dos veces; `revalidatePath` selectivo | Precio en caché ≤ 15 min |
| Virtualización | Lista de transacciones sin virtualizar | TanStack Virtual a partir de 200 filas; agrupación por día en servidor | 5 000 transacciones con scroll fluido |
| Percepción | Skeletons con altura aproximada | Skeleton con la altura exacta del componente (4 estados iguales) y `NumberFlow` para que el KPI aparezca antes que el gráfico | CLS < 0,05 |
| Imágenes y fuentes | 3 fuentes web (Sora, Manrope, Space Mono) | `next/font` con `display: swap` y subset latin; sin nuevas fuentes | LCP del Home < 2,0 s en 4G |

**Medición:** `next experimental-analyze --output` antes y después de cada pantalla (diff en el PR), Vercel Web Analytics para rutas más usadas, Lighthouse CI opcional no bloqueante en `/dashboard`, `/gastos`, `/mi-rich-life`, y un test de Playwright que mide el tiempo entre `navigate` y la aparición del titular.

**Regla:** un gráfico que necesite más de 400 puntos en el cliente está mal agregado, no mal renderizado.



## 21. Accessibility plan

Hoy ningún gráfico de CARTERA+ entrega un dato navegable a un lector de pantalla (área y línea van en `aria-hidden`; ninguno activa `accessibilityLayer`), y el resto de la app tiene buenas bases (roles en pestañas y diálogos, `aria-label` en botones de icono, tres reglas de reduced motion). El plan hace de la accesibilidad una propiedad de las primitivas, no una revisión final.

| Requisito | Cómo se cumple | Dónde se verifica |
| --- | --- | --- |
| Gráficos navegables por teclado | Recharts 3 con `accessibilityLayer` (flechas recorren puntos, un solo tab stop); ECharts con `aria.enabled` (nombre exacto por confirmar) + tabla alternativa «Ver datos» obligatoria | Test Playwright: `keyboard.press('ArrowRight')` cambia el tooltip |
| Tooltip con alternativa | El punto activo se anuncia por `aria-live="polite"`; el botón «Tabla» existe en toda `ChartFrame` principal | axe + revisión manual con VoiceOver (nota: VoiceOver exige desactivar QuickNav para las flechas) |
| No depender solo del color | Series con etiqueta directa al final de la línea, patrones (decals en ECharts) cuando hay > 3 series, estados de sobre con texto («al día», «en riesgo») además del color | Skill `dataviz` + `design:accessibility-review` por pantalla |
| Contraste | Texto ≥ 4,5:1, líneas y bordes de gráfico ≥ 3:1 sobre crema `#f4f2ec` y sobre `#15140f`; revisar `--warning` (`#b07a2e`) en texto pequeño | axe `color-contrast`; tabla de contraste en `tokens.css` |
| Foco visible | Anillo de 2 px `--accent` con offset en todo control, chip y punto de gráfico enfocado | axe + captura de foco en Playwright |
| Reduced motion | Sección 16: `MotionConfig`, `matchMedia` en Recharts/ECharts, NumberFlow sin rodado | Test con `page.emulateMedia({ reducedMotion: 'reduce' })` |
| Touch targets | ≥ 44 × 44 px en tiradores de brush, chips, filas de sobre y botones de la barra inferior | Captura a 390 px + medición con `getBoundingClientRect` |
| Estructura | Un `h1` por pantalla (título del núcleo), `h2` por franja, `nav` con `aria-current` (ya existe en `/m`), breadcrumb con `aria-label` | axe `heading-order`, `landmark-*` |
| Formularios y filtros | Chips de filtro como `button` con `aria-pressed`; el resumen «qué datos estoy viendo» en `aria-live` al cambiar | axe + test de teclado |
| Idioma y números | `lang="es-CR"`, cifras con `Intl` y `aria-label` completo donde se abrevia («₡1,2 M» → «un millón doscientos mil colones») | Revisión manual |

**Herramientas:** `@axe-core/playwright` 4.13 (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) en cada ruta de las 19 pantallas como job de CI bloqueante para violaciones críticas y serias; revisión manual con VoiceOver en Safari y TalkBack en la app móvil al cerrar cada núcleo; la skill `design:accessibility-review` en el paso 12 de cada pantalla.

**Meta:** WCAG 2.1 AA en toda la app, con la excepción documentada de los gráficos ECharts, que cumplen por la tabla alternativa y no por navegación interna.



## 22. Technical risks

Diez riesgos concretos, con su mitigación y el momento en que se atienden. Los dos primeros son de higiene y no esperan al rediseño.

| # | Riesgo | Probabilidad / impacto | Mitigación | Cuándo |
| --- | --- | --- | --- | --- |
| 1 | **Secreto en un archivo sin seguimiento.** `.claude/settings.local.json` (untracked, `??` en `git status`) contiene la clave `service_role` de Supabase dentro de comandos permitidos. Un `git add .` lo publicaría. | Media / crítico | Agregar `.claude/settings.local.json` a `.gitignore` hoy; reescribir esas entradas sin la clave; rotar la clave `service_role` en el dashboard de Supabase por precaución | Antes de cualquier rama |
| 2 | **Alerta falsa en el panel** (ancla vs saldo vivo). | Cierta / alto en confianza | Mergear `claude/agitated-wescoff-65711d` | Fase 0 |
| 3 | **Cifra de rendimiento contradictoria** (+57 % YTD). Un gráfico nuevo la haría más visible. | Cierta / alto | Diagnosticar con Supabase MCP (snapshots vs `investment_transactions`), documentar fórmulas de retorno simple y TWR con tests, y no publicar el KPI hasta que cuadre | Antes de Patrimonio · Inversiones |
| 4 | **Colisiones CSS al introducir nuevos componentes** en el mismo layout que Tailwind (ya ocurrió tres veces). | Alta / medio | Reestructurar `globals.css` en `@layer` y archivos antes de agregar clases; auditar nombres contra utilidades de Tailwind; prefijo `ca-` para las primitivas nuevas | Fase 0 |
| 5 | **Dos sistemas de tema en gráficos** (Recharts lee CSS vars; ECharts no). | Alta / medio | Un `buildEchartsTheme()` que lee `getComputedStyle` y se reaplica al cambiar `data-theme`; test visual en claro y oscuro | Fase 2 |
| 6 | **XSS por tooltip HTML** en ECharts con nombres de comercio del usuario. | Media / alto | `formatter` con escape obligatorio (helper único); test con un comercio llamado `<img onerror>` | Fase 2 |
| 7 | **Peso de ECharts filtrándose al Home.** | Media / medio | `dynamic` con `ssr:false` solo en 4 rutas; check de `next experimental-analyze` en CI | Fase 2 |
| 8 | **Renombrar rutas rompe enlaces** (correos, landing, FAQs, app móvil publicada, deep-links `?new=`). | Alta si se hace pronto / alto | Fase 1 solo cambia el menú; las URLs se consolidan al final con redirecciones 301 en `next.config` y un test que recorre todas las rutas viejas | Fase 6 |
| 9 | **Divergencia web / móvil** (`/m` con su propio menú y `mobile.css` de 4 617 líneas). | Cierta / medio | `nav.ts` como única fuente con rutas web y `/m`; las primitivas de gráfico se comparten; `mobile.css` solo conserva la piel del shell | Fase 1 y 2 |
| 10 | **Animaciones invisibles en desarrollo** (StrictMode) que llevan a «arreglar» lo que no está roto, y screenshots de Playwright que difieren entre Mac y CI. | Alta / bajo | Verificar movimiento en `next build && next start`; bases de `toHaveScreenshot` generadas en el contenedor de CI con `animations: 'disabled'` y datos congelados | Todo el proyecto |

**Riesgos de producto (no técnicos):** que los resúmenes de núcleo sean débiles y agreguen un clic (se mitiga con pestañas visibles y ⌘K); que «Libre para gastar» se lea como permiso y no como límite (se mitiga con la frase de lectura y el tooltip de fórmula); que la app móvil publicada en App Store (auditoría del 7-sep) reciba cambios de navegación a mitad de revisión (coordinar con David y con el calendario de Apple).


