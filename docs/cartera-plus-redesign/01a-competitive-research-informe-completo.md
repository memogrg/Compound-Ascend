# Informe completo: UX de productos premium de finanzas personales y wealth (2025–2026) y patrones aplicables a CARTERA+

_Informe de investigación del 16-sep-2026 (subagente de investigación; ~40 búsquedas, >50 páginas abiertas). El resumen ejecutivo y los 20 patrones priorizados están en el blueprint §19; este archivo conserva el detalle por producto._

## 1. Hallazgos transversales

1. **El número principal es una cifra accionable, no el saldo.** Copilot pone arriba «Free to Spend» (lo que queda del presupuesto sin contar los recurrentes esperados). Simplifi usa «Available to Spend» y PocketGuard «Leftover». Monarch reduce el presupuesto flexible a «one number» (Flex).
2. **La revisión de transacciones funciona como bandeja de entrada.** Copilot tiene «To Review» en el dashboard, «Mark as reviewed» y atajos de teclado en web (X seleccionar, R revisado, C categoría). Ramp y Mercury automatizan la categorización y dejan al humano solo las excepciones.
3. **Los recurrentes son un módulo de primer nivel.** Copilot, Monarch y Rocket Money los tienen en la navegación principal, con estados «pagado / por pagar», vista de calendario a 14 días (Rocket Money) y alimentan las proyecciones (Lunch Money: «Projected Income/Expenses»).
4. **Toda cifra va con su comparación.** Stripe usa tres desplegables: rango, granularidad y periodo de comparación. Copilot dibuja una línea punteada del periodo anterior. Apple Card muestra un mensaje de «cuánto más o menos gastaste que el periodo anterior».
5. **El Sankey es una vista de reporte, no un widget del dashboard.** En Monarch vive en Reports → Cash Flow y solo en web.
6. **Las metas muestran estado explícito.** Monarch Goals 3.0 usa «On track / Ahead / At risk», calcula el aporte mensual necesario y recalcula la fecha en tiempo real. En deudas compara avalancha y bola de nieve con una curva por cuenta.
7. **La IA ya se trata como asistente con confirmación.** Mercury Command: todas las acciones requieren aprobación explícita. Monarch: «informational and analytical only». Copilot Money Assistant (beta, agosto 2026): crea y edita categorías, presupuestos y transacciones, y ofrece «daily briefings». Acceso vía MCP a asistentes externos (Copilot, mayo 2026).
8. **Para rendimiento de inversión se usa TWR, no retorno simple.** Monarch, Copilot y Schwab (Modified Dietz enlazado mensualmente), con benchmark (S&P 500 y otros) en Monarch y Copilot.
9. **Barras laterales cortas y planas.** Monarch ~8–9 destinos (según un PRD de terceros); Copilot web 6 pestañas documentadas. Configuración (Categorías, Reglas, Comercios) dentro de Settings.

## 2. Análisis por producto

### Copilot Money (iOS/Mac; web desde el 15 dic 2025)
- Navegación web documentada: Dashboard, Transactions, Accounts, Investments, Categories, Recurrings (+ Cash Flow en apps; su presencia en el sidebar web no verificada). Indicador de transacciones sin revisar visible en toda la app.
- Dashboard en orden: (1) gráfico Free to Spend con línea punteada del ritmo ideal vs sólida del gasto real; (2) To Review; (3) Budgets; (4) Upcoming (recurrentes con scroll horizontal); (5) Net This Month (ingreso vs gasto, comparado con el mes anterior); (6) referidos.
- Cash Flow: tres tarjetas (Net Income, Spending como barras apiladas por categoría, Income); rangos YTD/MTD/12M/3M/4 semanas; periodo anterior punteado; interruptor para incluir gasto excluido; en Mac detalle al hover, en iOS toque y doble toque para bajar a transacciones.
- Transacciones web: filtros con totales (gastado, ingreso, neto), acciones masivas, atajos; división de transacciones (junio 2026) y prorrateo en 3/6/12 meses.
- Inversiones: Returns vs Balances; «Live Balance Estimate» como línea discontinua; asignación por tipo; Top Movers; benchmarks (VOO, IXUS, BTC, ETH); rendimiento tipo TWR con asterisco cuando la estimación está incompleta.
- Money Assistant (beta): briefings diarios, vigilancia de presupuestos y cargos inusuales, recategorización, gráficos en la conversación, CRUD.
- Etiquetas T/I/R; «varita mágica» que reequilibra presupuestos sin cambiar el total.
- No copiar: importar meses de historial sin depurar abruma (limitar el backlog); reembolsos duplican el gasto hasta corregirlos.

### Monarch Money
- Ayuda oficial: Dashboard, Accounts, Transactions, Reports/Cashflow, Budgets/Recurring, Goals, Investments, Settings. Orden exacto en producción no verificado. Forecasting desde abril 2026 (Monarch Plus).
- Dashboard personalizable: widgets Getting started, Credit score, Budget, Net worth, Recurring, Spending trend, Transactions, Investments, Advice, Weekly Recap (dic 2025); orden independiente entre web y móvil.
- Presupuesto: por categoría o **Flex** (Fixed / Non-monthly con rollover / Flex una sola cifra); pastillas «Remaining»; en móvil pulsación larga alterna Remaining/Actual.
- Reportes: pestañas Cash Flow, Spending, Income; Sankey (solo Cash Flow, solo web), barras de tendencia, dona, barras ordenadas, treemap (agosto 2026); agrupación por categoría/grupo/comercio; filtros por periodo, categoría, comercio, cuenta, etiqueta, monto; reportes guardados; clic en segmento → transacciones; tarjeta con ingreso, gasto, diferencia y tasa de ahorro; Cash Flow no exige presupuesto.
- Goals 3.0 (jun 2026): Save Up con On track / Ahead / At risk, aporte necesario, recálculo en vivo, tasa de crecimiento, varias cuentas por meta; Pay Down con APR, mínimo, pago planificado, tarjetas de principal/interés proyectado/total/fecha libre, curva por cuenta (sólida plan actual, punteada escenario anterior), simulador avalancha / bola de nieve / abonos extra.
- Inversiones: TWR ponderado, comparación S&P 500, Holdings agrupables, Advanced por clase; el gráfico simula «como si hubieras tenido tus valores actuales todo el periodo» (no es rendimiento histórico real).
- Forecasting: patrimonio proyectado a 90 años, marcadores de eventos, escenarios superpuestos, supuestos por defecto (ahorro 2 %, inversión 7 %, inmuebles 3 %, inflación 3 %).
- IA con icono de destello contextual en widgets y transacciones; no ejecuta acciones; desactivable. Shared Views (oct 2025): lo tuyo, lo mío, lo nuestro.
- No copiar: Sankey solo web; simulación «con holdings actuales» presentada como rendimiento.

### YNAB
- Pestañas móviles: Plan, Spending, Accounts, Reflect (App Store 26.34, 9 sep 2026). «Ready to Assign» arriba; rutina: rojo → amarillo → asignar a cero; pastillas verde/amarillo/rojo; Underfunded y Auto-Assign.
- Reflect: Spending Breakdown ordenado, por categoría o grupo, en %; Net Worth; Spending Trends.
- 2026: Hide Amounts web, compartir gráfico de patrimonio con montos ocultos, fotos en transacciones, emparejamiento de pagos de tarjeta, regla «dos de tres» para recategorizar, Cost to Be Me, Loan Planner.
- No copiar: jerga propia con curva de aprendizaje alta.

### Rocket Money
- Recurring con Upcoming (calendario 14 días), All, Inactive. Alertas de saldo bajo, uso alto de tarjeta y facturas próximas. No copiar: cobro del 35–60 % del ahorro negociado; upsells agresivos; inversión débil.

### Empower Personal Dashboard
- Menú superior horizontal. Dashboard: Net Worth (365 días, YTD y diario) → Performance (90 días) → Retirement Savings → Market Movers → Budgeting → Cash Flow → Emergency Fund (12 meses vs rango objetivo) → Debt Paydown. Hover da detalle, clic lleva a la página. Fee Analyzer, Investment Checkup, Retirement Planner. No copiar: presupuesto débil; puerta a asesoría comercial.

### Wealthfront
- Path: proyección de escenarios (retiro, tiempo libre, universidad). Autopilot: saldo máximo → transferencia automática con 24 h para cancelar.

### Betterment
- Menú hamburguesa; «Total net worth» con «See performance»; metas dentro de Accounts con «Projected balance». No copiar: rendimiento enterrado dos niveles.

### Revolut
- Revolut 10: widgets personalizables, temas, Pockets. Analytics: Spent/Income, barras/dona/línea con comparación, periodos 1s/1m/6m/1a/custom, agrupación por categoría, comercio, país, moneda, tarjeta; excluye transferencias internas. No copiar: venta cruzada en la portada.

### N26 / Wise
- N26 Spaces (subcuentas con IBAN, Income Sorter, Round-ups, Shared Spaces). Wise: main account + jars multimoneda + groups; extras detrás de «Do more with your money».

### Robinhood, Fidelity, Schwab
- Robinhood Legend: widgets arrastrables, plantillas, hasta 8 gráficos; no copiar el trading a un clic.
- Fidelity Positions: tabla/gráfico en $ o %, filtro por cuenta, agrupación por cuenta o valor, «Change Since Purchase» junto a «Change Since Close», View Lots, Save View.
- Schwab: TWR (Modified Dietz enlazado mensualmente) como «a truer measurement».

### Apple Card / Wallet
- Selector Semana/Mes/Año, deslizar para periodos anteriores, mensaje comparativo; búsqueda por categoría, comercio o lugar. Wallet Highlights: tendencias, promedios, transacciones grandes, comercios frecuentes.

### Stripe Dashboard
- Sidebar por tarea (Payments, Payouts, Customers, Disputes, Billing, Reporting — fuente secundaria). Portada: widgets editables; rango con preset/unidad/comparación; ~5 métricas con sparkline y periodo anterior en texto pequeño; color reservado para estados; búsqueda global.
- Guía oficial de gráficos: línea = ¿sube o baja?, barra = ¿cuánto por categoría?, medidor = reparto, sparkline = tendencia; «Pair charts with headline metrics»; alturas fijas (180 px tarjeta, 320 px detalle); ≤ 3 gráficos por fila; cuatro estados (carga, error, vacío, datos) con la misma altura.

### Linear, Ramp, Mercury
- Linear: «/» búsqueda global, Cmd+F en vista, «O» + «I» para ir a issue, filtros con «@»; Cmd+K como referencia de paleta de comandos (Maggie Appleton).
- Ramp 2025: agentes de políticas y AP, AI Reporting en lenguaje natural, uso por Slack/SMS, seguimientos automáticos.
- Mercury Command (16 jun 2026): asistente con icono de terminal, toda acción con aprobación explícita, respeta límites y aprobaciones duales; reglas de categorización multi-condición (ago 2026); IA desactivable (jul 2026).

### Origin, Simplifi, Lunch Money, Tiller, PocketGuard, Nubank
- Origin: Sidekick IA que deriva a CFP a $119; comparación contra cualquier mes; Sankey; suscripciones; proyección con inflación 3 %. No copiar: presupuesto e inversión superficiales.
- Simplifi Spending Plan: Ingresos − Recurrentes − Gasto planificado − Metas = Available to Spend; Watchlists.
- Lunch Money: Period Picker arriba a la izquierda; Accounts Overview independiente del periodo; Period Summary con ingreso, gasto, neto, tasa de ahorro y Projected Income/Expenses; Spending Breakdown vs total o vs presupuesto; preferencias de tarjeta persistentes.
- Tiller: Monthly/Yearly Budget en hojas; referente del usuario avanzado; no copiar la carga manual.
- PocketGuard: Leftover = Ingresos − Gastos − Metas, con barras separadas y cálculo completo al clic.
- Nubank: portada blanca con scroll vertical, atajos arriba, ocultar saldo, historial de notificaciones; Caixinhas con nombre e imagen, rendimiento por caixinha, «Separado do meu saldo». No copiar: escaparate de productos.

### Referentes de comportamiento
- Ramit Sethi, Conscious Spending Plan: fijos 50–60 %, inversión 10 %, ahorro 5–10 %, gasto sin culpa 20–35 %; automatizar el día de pago.
- Vanguard «Principles for behavioral design» (sep 2025), marco ACE: efectivo ocioso ($6.2 B movidos), recordatorios de impuestos ($2.16 B), autoinscripción (94 % vs 64 %), mensajes empáticos (24 % → 29 %); «durable win-win» vs dark patterns.
- Eleken (2026): encuadre sin juicio, un valor principal por pantalla, divulgación progresiva, señales que no dependan solo del color.
- ProjectionLab: el Sankey muestra proporción y concentraciones; es una foto estática, no reemplaza al presupuesto.

## 3. Patrones transferibles (30)

| # | Patrón | Ejemplo | Por qué funciona | Dónde en CARTERA+ | Riesgos |
|---|---|---|---|---|---|
| 1 | Cifra principal «Libre para gastar» que descuenta recurrentes pendientes | Copilot, Simplifi, PocketGuard | Responde «¿puedo gastar hoy?» | Panel y Gastos | Fórmula explicable; recurrentes mal detectados |
| 2 | Ritmo ideal vs gasto real | Copilot | Adelantado/atrasado sin cuentas | Panel y sobres | Ingresos quincenales |
| 3 | Bandeja «Por revisar» con atajos | Copilot | Hábito de segundos | Transacciones, ingest_proposals | Backlog inicial |
| 4 | Fijo / No mensual / Flexible con una cifra | Monarch Flex | Menos microgestión | Modo alternativo | Choca con sobres granulares |
| 5 | Rollover no mensual | Monarch | Evita el «mes sorpresa» | Sobres anuales | Explicar acumulado |
| 6 | Estados de color + texto por sobre | YNAB | Triage inmediato | Sobres | No solo color |
| 7 | Recurrentes con estados y calendario 14 días | Rocket Money, Copilot | Anticipa salidas | Recurrentes | Falsos positivos |
| 8 | Proyección con recurrentes no pagados | Lunch Money | Cierre estimado | Resumen | Ingresos variables |
| 9 | Comparación junto al KPI | Stripe, Copilot, Apple Card | «¿Está bien?» | Todas las tarjetas | Meses atípicos |
| 10 | Preset + unidad + comparación | Stripe | Un control coherente | Encabezado | Simplificar en móvil |
| 11 | Frase comparativa sin juicio | Apple Card, Eleken | Se entiende sin gráfico | Insights | Voseo sin culpa |
| 12 | Sankey como reporte | Monarch, Origin | Concentraciones y tasa de ahorro | Flujo · Resumen | Ilegible en móvil |
| 13 | Segmento → transacciones filtradas | Monarch | Del qué al por qué | Frascos y gráficos | Filtros en URL |
| 14 | Reportes guardados | Monarch | Rutinas reutilizables | Futuro | Sobrecarga básico |
| 15 | Treemap / barras ordenadas | Monarch, YNAB | Ranking legible | Gastos | Pierde el tiempo |
| 16 | Metas con estado y recálculo en vivo | Monarch Goals 3.0 | Progreso → acción | Metas | Supuestos visibles |
| 17 | Apartados con nombre e imagen | Nubank, Wise | Vínculo emocional | Metas y frascos | Imágenes pesadas |
| 18 | Curva por deuda + fecha libre + simulador | Monarch Pay Down | Costo en intereses | Deudas | Tasas variables |
| 19 | Patrimonio por activos y pasivos con YTD | Empower, Lunch Money | Dirección | Patrimonio | Pocos puntos |
| 20 | TWR + benchmark + «desde compra» + lotes | Monarch, Copilot, Schwab, Fidelity | Habilidad vs aportes | Inversiones | TWR poco intuitivo |
| 21 | Estimación en vivo discontinua | Copilot | Estimado ≠ confirmado | Portafolio | Indicar hora |
| 22 | Widgets reordenables | Monarch, Stripe, Revolut | Cada hogar prioriza | Panel | Dashboards vacíos |
| 23 | Resumen semanal/diario | Monarch, Copilot | Hábito | Campana y correo | Fatiga |
| 24 | Asistente contextual por widget | Monarch | Contexto cargado | Asesor | Costo IA |
| 25 | IA con confirmación y límites | Mercury, Monarch | Confianza | ReceiptConfirmCard | No saltarse |
| 26 | Paleta de comandos / búsqueda global | Linear, Stripe | Discoverability | ⌘K | Usuarios móviles |
| 27 | Ocultar montos | YNAB, Nubank | Privacidad | Interruptor | Estado confuso |
| 28 | Automatización con ventana de cancelación | Wealthfront | Control | Barrido a metas | Sin agregación en CR |
| 29 | Recategorización conservadora (2 de 3) | YNAB | Evita errores | Correos | Aprende lento |
| 30 | Onboarding no lineal y 4 estados de igual altura | Monarch, Stripe | Valor con datos parciales | Todas las tarjetas | Scores engañosos |

## Fuentes (páginas abiertas)
Copilot: help.copilot.money (dashboard 6045480, cash flow 9682232, web 11780342, recurrings 9778259, investment performance 5497919, investments 5377645); moneywithkatie.com/copilot-review; releasebot.io/updates/copilot-money.
Monarch: help.monarch.com (Cash Flow 20504904768020, Reports 21846787088916, Dashboard 360058127551, Investments 41855507661076, Getting Started 360048393272, Flex 32125337244052, Pay Down 44373293932052, AI 37526856682260, Forecasting 48344305092244); monarch.com/whats-new, /blog/winter-release, /blog/goals, /features/tracking; github.com/JoshiDG/pesantmoney/issues/49 (secundaria).
YNAB: ynab.com/whats-new, whats-new/spending-breakdown-reflecting-on-web, blog/five-minute-budget-routine, apps.apple.com/us/app/ynab/id1010865877.
Otros: help.rocketmoney.com/en/articles/2185531; robberger.com (rocket-money, empower, origin); support-personalwealth.empower.com/hc/en-us/articles/201169740; support.wealthfront.com/hc/en-us/articles/360019482852; wealthfront.com/blog/meet-autopilot; betterment.com/advisors/resources/whats-new-q3-2025, betterment.com/help/mobile-investment-management; quicken.com/blog/simplifi-spending-plan-better-than-budgeting; pocketguard.com/help/leftover; revolut.com/news/revolut_launches_revolut_10; help.revolut.com (budget-and-analytics); n26.com/en-at/budgeting; wise.com/help/articles/645Ve1Ah1Psi0srHGfKYmm; mundoconectado.com.br (Nubank), comunidade.nubank.com.br (nova tela inicial), blog.nubank.com.br/dinheiro-guardado-nubank-mudou; finder.com/investments/robinhood-legend; fidelity.com/accounts/popups/positions-whats-new.shtml; content.schwabplan.com/download/misc/PersonalPerformanceHelp.htm; support.apple.com/en-us/102329, /123096; support.stripe.com (dashboard-home-page-charts); docs.stripe.com/stripe-apps/patterns/chart-layout; 925studios.co/blog/stripe-dashboard-design-breakdown; linear.app/docs/search; maggieappleton.com/command-bar; ramp.com/blog/2025-release-notes; mercury.com/blog/introducing-mercury-command, mercury.com/releases; useorigin.com/products/spending; support.lunchmoney.app/home/overview; help.tiller.com/en/articles/3250815; iwillteachyoutoberich.com/conscious-spending-basics; corporate.vanguard.com (principles_for_behavioral_design PDF); eleken.co/blog-posts/fintech-ux-best-practices; projectionlab.com/financial-terms/sankey-cash-flow-diagram.
