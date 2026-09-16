# CARTERA+ · Rediseño UX — Design system y motion

_Extraído del blueprint maestro (16-sep-2026). Fuente viva: https://claude.ai/code/artifact/0e037de8-78ec-44fd-b4ef-3ea701eea331_

## 17. Design system audit

El design system «Compound Ascend» tiene una base de tokens que vale la pena conservar y una capa de componentes que hay que consolidar: 554 clases en un `globals.css` de 7 614 líneas más un `mobile.css` de 4 617 líneas para `/m`, con 23 variantes de `card`, 19 de `chip`, 16 de `btn`, 11 de `tab`, 8 de `modal`, y **cero** clases de KPI, tooltip o drawer propias. Los breakpoints se declaran en 51 media queries con seis anchos distintos (560, 640, 720, 760, 1000 px…).

| Capa | Estado | Veredicto | Acción |
| --- | --- | --- | --- |
| **Color** | Paleta cálida propia: canvas `#f4f2ec`, tinta `#1e1c16`, verde `#378451`, semánticos (success/warning/danger/info) con variantes `-soft`, colores por dominio `--c-income … --c-networth`, rangos `--rank-1..3` con contraste documentado, tema oscuro completo | **Conservar** | Agregar los tokens de gráfico (sección 14); verificar contraste AA de `--warning` sobre crema (ámbar `#b07a2e` ≈ 4,2:1 en texto pequeño, límite) |
| **Tipografía** | Sora (display), Manrope (cuerpo), Space Mono (cifras y ejes); `--figure-weight: 600` | **Conservar**, con una regla | Cifras de KPI en Sora `tabular-nums` (no en Space Mono, que se ve «de terminal» en 40 px); Space Mono solo en ejes, tablas y etiquetas pequeñas. Definir escala: 44 / 28 / 20 / 16 / 14 / 12,5 / 11 |
| **Espaciado y radios** | `--sp1..16` (4-64 px), `--r-sm..2xl` (8-24 px), `--r-pill` | **Conservar** | Fijar radio de tarjeta en `--r-lg` (16) y de controles en `--r-btn` (10); prohibir `--r-2xl` en tarjetas (evita el «todo redondo») |
| **Elevación** | `--e1..e3` sombras suaves; la sombra, no el borde, levanta las tarjetas (decisión de marca) | **Conservar** | Una sola sombra por nivel; nunca tarjeta con sombra dentro de tarjeta con sombra |
| **Tarjetas** | 23 variantes (`card`, `card-title`, `dash-*`, `acc-*`, etc.) | **Normalizar** | Una `Card` con 3 variantes (base, destacada, interactiva) y un `SectionHeader` (título + ayuda + toolbar). Las 23 clases se mapean a esas 3 |
| **KPI** | `MetricCard` (`shared/metric-card.tsx`) con `delta` y tono, sin sparkline ni comparación configurable | **Evolucionar** | `KpiHero` y `KpiCard` con número animado, delta con signo y flecha, etiqueta de comparación, sparkline opcional, tooltip «?»; misma altura en fila |
| **Botones y chips** | `btn`, `btn-primary`, `btn-secondary`, `chip`, `seg`/`seg-btn` (segmented) | **Conservar**, podar | Reducir a primary / secondary / ghost / danger + tamaños sm/md; chips de filtro con × para quitar |
| **Pestañas** | `base-tabs` (hash), `tab*` (11 clases), segmented control | **Normalizar** | Un solo `Tabs` (Radix Tabs ya disponible) enlazado a URL; el segmented control se reserva para rangos dentro de tarjetas |
| **Controles** | `input`, `select`, `money-field` (coma decimal), `jar-date-picker` | **Conservar** | Agregar `DateRangePicker` (react-day-picker, locale es, TZ del perfil) para el periodo personalizado |
| **Tablas** | 5 clases; lista de transacciones a mano | **Evolucionar** | `DataTable` sobre TanStack Table v9 con virtualización, columnas fijas y filas agrupadas por día |
| **Modales y drawers** | 8 clases de modal (`modal.tsx`), sin drawer | **Evolucionar** | `Drawer` lateral (Radix Dialog) para detalle de deuda/holding/meta/sobre en escritorio; los modales quedan para confirmaciones |
| **Tooltips** | `help-tip` (icono ?) y `tooltip-layer` con Floating UI | **Conservar** | Es la regla «tooltips, no texto inline»; extender al tooltip de gráfico para que comparta estilo |
| **Badges y estados** | 8 badges; `states.tsx` (EmptyState), `ChartEmpty`, `skel` | **Conservar**, completar | Agregar estado «datos parciales» y «vacío por filtro»; skeletons con la altura exacta del componente final |
| **Alertas y toasts** | `toast.tsx`; `auth-msg warn` reutilizado como banner | **Normalizar** | Un `Banner` con 4 tonos; los toasts confirman con la cifra |
| **Gráficos** | 3 wrappers Recharts + 37 SVG a mano | **Reconstruir** | Sección 14 |
| **Iconos** | `Icon` propio (`ui/icon.tsx`) + lucide + tabler | **Podar** | Una sola fuente (lucide) envuelta por `Icon`; los tres juntos pesan y desalinean trazos |
| **Movimiento** | 3 reglas `prefers-reduced-motion`, `tw-animate-css`, Motion 12 | **Sistematizar** | Tokens de la sección 16 |
| **Responsive** | 6 breakpoints distintos | **Normalizar** | Tres: 640 (móvil), 1024 (tablet), 1280 (escritorio ancho), como variables |
| **Arquitectura CSS** | Un archivo por clases + Tailwind cargado en el mismo layout; colisiones documentadas tres veces | **Reestructurar sin rediseñar** | Dividir `globals.css` en `@layer tokens / base / components / charts / utilities` y por archivo (`tokens.css`, `components/*.css`); auditar nombres contra utilidades de Tailwind; sin cambiar ninguna apariencia en ese paso |
| **Identidad** | Crema + verde + serif itálica en titulares; logotipo `.cw` nunca itálico, `+` verde | **Proteger** | Es lo que distingue a CARTERA+ del SaaS azul; el rediseño sube la precisión, no cambia la voz |

**Lo que NO se hace:** no se migra a shadcn completo, no se reemplaza Radix por Base UI, no se cambia la paleta ni las fuentes, no se «modernizan» los radios, no se agrega glassmorphism. El objetivo del audit es que una pantalla nueva se arme con 8 piezas (`SectionHeader`, `KpiHero`, `KpiCard`, `ChartFrame`, `BreakdownCard`, `InsightList`, `ActionStrip`, `DataTable`) y cero CSS nuevo.



## 16. Motion & microinteraction system

La app debe sentirse **serena y precisa**: el movimiento confirma, relaciona y orienta; nunca decora. Se define un solo sistema de duraciones y curvas como tokens CSS, se prioriza CSS → Web Animations → JS (guía de Vercel), y se respeta `prefers-reduced-motion` reduciendo, no eliminando.

| Token | Duración | Curva | Uso |
| --- | --- | --- | --- |
| `--dur-micro` | 120 ms | `cubic-bezier(0.2, 0, 0, 1)` | Hover, focus, cambio de color, chips, tooltip y crosshair (100-150 ms) |
| `--dur-standard` | 200 ms | idem | Resaltar/atenuar serie, abrir menú, toggle, selección |
| `--dur-transition` | 320 ms | `cubic-bezier(0.05, 0.7, 0.1, 1)` (entrada) / `(0.3, 0, 0.8, 0.15)` (salida) | Entrada de datos en gráfico, drawer, cambio de pestaña, drill-down |
| `--dur-range` | 450 ms | entrada | Cambio de periodo o rango (el gráfico interpola, no parpadea) |
| `--dur-number` | ≤ 600 ms | ease-out | KPIs con NumberFlow (rodado de dígitos) |

Valores tomados de los tokens de Material 3 (short 50-200 ms, medium 250-400 ms, 300 ms el más común) y validados contra la regla de Vercel de animar solo `transform` y `opacity`.

**Lo que el movimiento debe comunicar en CARTERA+:**

- **Selección:** el segmento elegido sube 2 px y el resto baja a 0,3 de opacidad en 200 ms; el chip de filtro aparece con un fade de 120 ms.
- **Relación:** al pasar por una serie, su leyenda, su KPI y su fila de tabla se iluminan juntos (mismo color, mismo tiempo).
- **Transición:** al cambiar de mes, las barras interpolan a su nuevo valor (`universalTransition` en ECharts, animación de Recharts) y el titular rueda con NumberFlow; nada desaparece y reaparece.
- **Jerarquía:** al entrar a una pantalla, el titular aparece primero (0 ms), las tarjetas secundarias a +60 ms y el gráfico principal dibuja su línea de izquierda a derecha en 320 ms; una sola vez por carga, nunca al volver con «atrás».
- **Feedback:** registrar un gasto hace que el sobre correspondiente parpadee una vez (120 ms) y su barra avance; el toast confirma con la cifra.

**Reduced motion:** `<MotionConfig reducedMotion="user">` en el shell (Motion conserva opacidad y color, quita transform y layout); `isAnimationActive={false}` en Recharts y `animation: false` en ECharts leídos de `matchMedia`; NumberFlow sin rodado (`respectMotionPreference`, por defecto); crossfade de 150 ms como reemplazo de cualquier movimiento. Las animaciones de scroll de la landing quedan fuera de este sistema.

**Herramientas:** CSS transitions para el 80 % (hover, chips, barras); Motion 12/13 con `LazyMotion` + `m` (30 kB gz) para drawers, listas con `AnimatePresence` y layout; NumberFlow para cifras; **sin GSAP** (no aporta sobre Motion para UI de producto) y **sin React Spring** como dependencia propia.

**Anti-reglas:** nada se mueve solo por más de 5 s; ningún glow permanente (solo en el punto activo); ningún parallax; ninguna animación al cambiar de pestaña en móvil por encima de 200 ms; y toda animación de gráfico se verifica en `next build && next start`, porque en `next dev` StrictMode las esconde (lección ya documentada en el repo).


