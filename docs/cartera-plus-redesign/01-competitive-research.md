# CARTERA+ · Rediseño UX — Investigación competitiva

_Extraído del blueprint maestro (16-sep-2026). Fuente viva: https://claude.ai/code/artifact/0e037de8-78ec-44fd-b4ef-3ea701eea331_

## 19. Competitive benchmark

Se estudiaron 22 productos abriendo sus centros de ayuda, notas de versión y reseñas independientes (unas 50 páginas; los menús literales que no pude confirmar de primera mano están marcados). Nueve hallazgos transversales gobiernan lo que CARTERA+ debe tomar prestado, y 20 patrones concretos indican dónde.

**Hallazgos transversales**

1. **El número principal es accionable, no el saldo.** Copilot pone arriba «Free to Spend»; Simplifi «Available to Spend»; PocketGuard «Leftover = ingresos − gastos − metas»; Monarch reduce el presupuesto flexible a una sola cifra. Todas descuentan los compromisos futuros del mes.
2. **Las transacciones se revisan como bandeja de entrada** (Copilot «To Review» con atajos X/R/C; Ramp y Mercury dejan al humano solo las excepciones).
3. **Los recurrentes son un módulo de primer nivel** con estados pagado / por pagar / inactivo y calendario a 14 días (Rocket Money, Copilot, Monarch), y alimentan la proyección del mes (Lunch Money «Projected»).
4. **Toda cifra va con su comparación**: Stripe usa rango + granularidad + periodo de comparación; Copilot dibuja el periodo anterior punteado; Apple Card lo dice en una frase («gastaste X más que…»).
5. **El Sankey es un reporte, no un widget** (Monarch: Reports → Cash Flow, solo web).
6. **Metas y deudas con estado explícito**: Monarch Goals 3.0 (On track / Ahead / At risk, aporte necesario, recálculo en vivo); Pay Down con curva por cuenta, fecha libre y simulador avalancha / bola de nieve.
7. **La IA actúa con confirmación** (Mercury Command aprueba todo; Monarch solo informa; Copilot Money Assistant crea y edita con briefings diarios).
8. **Rendimiento con TWR y benchmark** (Monarch, Copilot, Schwab con Modified Dietz); Fidelity muestra «desde compra» junto a «desde cierre».
9. **Sidebars cortos y planos**: Monarch \~9 destinos, Copilot web 6, Stripe agrupado por tarea; la configuración (categorías, reglas, comercios) vive en Settings. CARTERA+ tiene 14.

**Patrones transferibles (los 20 con mayor impacto)**

| # | Patrón | Ejemplo | Por qué funciona | Dónde en CARTERA+ | Riesgo |
| --- | --- | --- | --- | --- | --- |
| 1 | Titular «Libre para gastar» que descuenta compromisos | Copilot, Simplifi, PocketGuard | Responde «¿puedo?» con un número | Hoy · Panel | Fórmula explicable; recurrentes mal detectados engañan |
| 2 | Ritmo ideal vs gasto real del mes | Copilot | Adelantado/atrasado sin hacer cuentas | Panel y Gastos | Ingresos quincenales: ritmo no lineal |
| 3 | Bandeja «Por revisar» con atajos | Copilot | Clasificar en segundos | Transacciones, `ingest_proposals` | Limitar el backlog inicial |
| 4 | Cubetas Fijo / No mensual / Flexible | Monarch Flex | Menos microgestión | Modo alternativo de sobres | Choca con sobres granulares |
| 5 | Rollover para gastos anuales | Monarch Non-monthly | Evita el «mes sorpresa» (marchamo, seguros) | Sobres anuales | Explicar el saldo acumulado |
| 6 | Estado por sobre con color + texto | YNAB | Triage inmediato | Sobres | No depender solo del color |
| 7 | Recurrentes con estados y calendario | Rocket Money, Copilot | Anticipa salidas de caja | Flujo · Recurrentes (nuevo) | Falsos positivos |
| 8 | Proyección del periodo con recurrentes pendientes | Lunch Money | Cierre estimado del mes | Flujo · Resumen | Ingresos variables |
| 9 | Comparación siempre junto al KPI | Stripe, Copilot, Apple Card | Responde «¿está bien?» | Todas las KpiCard | Meses atípicos (aguinaldo) |
| 10 | Selector preset + unidad + comparación | Stripe | Un solo control coherente | Barra superior | Simplificar en móvil |
| 11 | Frase comparativa sin juicio | Apple Card, Eleken | Se entiende sin gráfico | Señales de cada dashboard | Voseo y sin culpa |
| 12 | Sankey como reporte con drill-down | Monarch, Origin | Muestra concentraciones y tasa de ahorro | Flujo · Resumen (escritorio) | Ilegible en móvil: barras ordenadas |
| 13 | Clic en segmento → transacciones filtradas | Monarch | Del qué al por qué | Todos los gráficos | Filtros en URL |
| 14 | Treemap / barras ordenadas para distribución | Monarch treemap, YNAB | Ranking más legible que una dona | Gastos | Pierde el tiempo |
| 15 | Metas con estado, aporte necesario y recálculo en vivo | Monarch Goals 3.0 | Progreso → acción | Planes · Metas | No prometer rendimientos |
| 16 | Curva por deuda, fecha libre, simulador de abonos | Monarch Pay Down | Costo en intereses visible | Planes · Deudas | Tasas variables CRC/USD |
| 17 | Patrimonio por activos y pasivos con cambio YTD | Empower, Lunch Money | Dirección, no solo nivel | Patrimonio · Resumen | Pocos puntos en cuentas nuevas |
| 18 | TWR + «desde compra» + aportes vs crecimiento | Monarch, Copilot, Fidelity | Separa habilidad de aportes | Patrimonio · Inversiones | TWR poco intuitivo: tooltip |
| 19 | Asistente contextual por tarjeta + resumen semanal | Monarch sparkle, Copilot briefings | Pregunta con contexto cargado | Todas las tarjetas; campana | Costo de IA |
| 20 | Estados vacíos de igual altura y onboarding no lineal | Stripe, Monarch | Sin saltos de layout; valor con datos parciales | Todas las plantillas | Scores engañosos con datos parciales |

**Qué no copiar:** el escaparate de productos en la portada (Nubank, Revolut), la jerga propia con curva de aprendizaje (YNAB «Ready to Assign»), enterrar el rendimiento dos niveles abajo (Betterment), simular rendimiento «como si hubieras tenido los holdings actuales» sin aclararlo (Monarch), operar con un clic (Robinhood), y un Sankey solo web sin alternativa móvil.

Fuentes principales: [Copilot dashboard](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview), [Copilot cash flow](https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview), [Copilot web](https://help.copilot.money/en/articles/11780342-copilot-money-for-web), [Monarch reports](https://help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports), [Monarch Flex](https://help.monarch.com/hc/en-us/articles/32125337244052-Using-Flex-Budgeting), [Monarch goals](https://www.monarch.com/blog/goals), [Monarch pay down](https://help.monarch.com/hc/en-us/articles/44373293932052-Using-Pay-Down-Goals), [Monarch investments](https://help.monarch.com/hc/en-us/articles/41855507661076-Investments-in-Monarch), [YNAB what's new](https://www.ynab.com/whats-new), [Rocket Money recurring](https://help.rocketmoney.com/en/articles/2185531-managing-your-bills-and-subscriptions), [Empower dashboard](https://support-personalwealth.empower.com/hc/en-us/articles/201169740-Dashboard-Overview), [Stripe chart layout](https://docs.stripe.com/stripe-apps/patterns/chart-layout), [Stripe home charts](https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights?locale=en-GB), [Mercury Command](https://mercury.com/blog/introducing-mercury-command), [Linear search](https://linear.app/docs/search), [Apple Card](https://support.apple.com/en-us/102329), [Schwab TWR](https://content.schwabplan.com/download/misc/PersonalPerformanceHelp.htm), [Fidelity positions](https://www.fidelity.com/accounts/popups/positions-whats-new.shtml), [Lunch Money overview](https://support.lunchmoney.app/home/overview), [PocketGuard leftover](https://pocketguard.com/help/leftover/), [Simplifi spending plan](https://www.quicken.com/blog/simplifi-spending-plan-better-than-budgeting/), [Nubank caixinhas](https://blog.nubank.com.br/dinheiro-guardado-nubank-mudou/), [Vanguard behavioral design](https://corporate.vanguard.com/content/dam/corp/research/pdf/principles_for_behavioral_design_nudging_for_better_investor_outcomes.pdf), [Eleken fintech UX](https://www.eleken.co/blog-posts/fintech-ux-best-practices).


