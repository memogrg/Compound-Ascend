# CARTERA+ · Rediseño UX — Inventario y análisis por módulo

_Extraído del blueprint maestro (16-sep-2026). Fuente viva: https://claude.ai/code/artifact/0e037de8-78ec-44fd-b4ef-3ea701eea331_

## 11. Module-by-module analysis

Cada módulo se describe con las preguntas que debe responder, los KPIs y visualizaciones que las responden, lo que ya existe en datos, lo que falta, y las fórmulas que hay que documentar antes de dibujar. Convención de librerías: **R** = Recharts 3 (gráficos de lectura), **E** = ECharts 6 modular (gráficos analíticos), **S** = SVG propio del design system (barras de progreso, medidores).

### Ingresos (Income Intelligence)

- **Responde:** ¿cuánto entró? ¿vs lo esperado? ¿de dónde? ¿qué tan concentrado y estable? ¿cuándo entra? ¿qué fue extraordinario? ¿cómo viene el próximo mes?
- **Titular:** ingreso del periodo vs esperado (fuentes recurrentes agendadas). **Secundarios:** recurrente vs variable, n.º de fuentes y % de la principal (concentración), promedio 6 meses, estabilidad (coeficiente de variación 6-12 meses, mostrado como «estable / variable / irregular»).
- **Visualizaciones:** barras mensuales apiladas por fuente 12-24 meses con línea de esperado (E, con brush para elegir rango) · barras horizontales ordenadas por fuente con % (R) · calendario del mes con días de cobro esperados y reales (E `calendar`) · YoY solo cuando existan ≥ 13 meses.
- **Existe:** `income_sources`, `budget_items` de ingreso por periodo, `ensureRecurringIncome`, histórico y donut por fuente. **Falta:** esperado vs real por fuente, calendario, clasificación extraordinario (regla: > 2× el promedio de esa fuente o fuente sin recurrencia), forecast (media móvil 3 meses de lo variable + recurrentes agendados; etiquetado «estimación»).
- **Drill-down:** fuente → transacciones de ingreso con `?fuente=`.

### Gastos y sobres (Spending Intelligence + Budget Control)

- **Responde:** ¿cuánto gasté? ¿más o menos que antes? ¿por encima del presupuesto? ¿en qué sobres? ¿qué comercios? ¿qué es fijo y qué variable? ¿qué cambió o es anómalo? ¿cuánto me queda por sobre? ¿voy al ritmo?
- **Titular:** gasto del periodo vs presupuesto, con proyección al cierre (`gasto_a_hoy / días_transcurridos × días_del_mes`, ajustada por recurrentes pendientes). **Secundarios:** promedio diario, fijo vs variable (naturaleza, ya existe `expenseByNature`), sobres en riesgo (usado % > día del mes % + 15 pts), mayor gasto individual.
- **Visualizaciones:** trayectoria acumulada ideal vs real del mes con marca de hoy (R, el gráfico que más importa) · treemap o barras ordenadas por sobre/categoría con % del total (E treemap con drill-down grupo → sobre → categoría) · tendencia 12 meses apilada por grupo (E) · top comercios (R barras) · heatmap-calendario de gasto diario (E, opcional en escritorio) · lista de sobres con barra «queda» y estado de color + texto (S, evolución de `jar-row`).
- **Presupuesto como control center dentro de la misma pantalla:** presupuestado · real · comprometido (recurrentes no pagados) · disponible · proyectado, por sobre y total; rollover solo para sobres marcados anuales (marchamo, seguros, aguinaldo). Conexión presupuesto → sobre → categoría → transacción en un clic por nivel.
- **Existe:** frascos con 6 grupos + 4 vinculados, `?range`, `RitmoPanel`, `sobre-ocioso`, top 10, donut, `merchantOrSource` en transacciones. **Falta:** trayectoria del mes, comercios agregados, anomalías (regla: transacción > media + 2σ de su categoría en 6 meses, o categoría > 1,3× su promedio 3 meses), interacción enlazada (clic en sobre filtra tendencia y comercios).

### Transacciones

- **Responde:** ¿qué movimientos hubo con este filtro y cuánto suman? ¿qué falta por revisar o clasificar?
- **Diseño:** bandeja «Por revisar (N)» arriba con atajos (J/K mover, C categoría, R revisado, X seleccionar), totales del filtro (gasto, ingreso, neto) siempre visibles, chips de filtro (periodo global + categoría, sobre, comercio, miembro, origen, monto), tabla virtualizada (TanStack Table v9 + Virtual) con agrupación por día, edición en drawer. Sin gráfico principal: un sparkline del filtro es suficiente.

### Recurrentes (nuevo)

- **Responde:** ¿qué se cobra y se paga solo? ¿cuándo? ¿qué ya pasó y qué falta? ¿qué subió?
- **Fuente:** `budget_items` recurrentes (ingresos y sobres fijos), cuotas de `debts`, aportes DCA de holdings, aportes recurrentes de metas, pólizas con prima. No hace falta tabla nueva: es una vista compuesta con estado pagado / por pagar / inactivo, calendario 30 días (E `calendar` o lista por día) y alimenta la proyección del mes.

### Metas (Planes · Ahorro)

- **Responde:** ¿cuánto llevo y cuánto falta? ¿voy al ritmo? ¿cuándo llego? ¿qué aporte necesito? ¿qué pasa si aporto más?
- **Por meta:** estado **al día / adelantada / en riesgo** (`aporte_mensual_actual` vs `aporte_necesario = (objetivo − acumulado) / meses_restantes`), fecha estimada al ritmo actual (promedio 3 meses de aportes), diferencia contra plan, hitos 25/50/75/100.
- **Visualizaciones:** anillo de progreso con estado (S) · línea acumulado real vs plan lineal (R) · simulador «+₡X al mes» que recalcula la fecha en vivo (input + R). Sin confeti ni medallas: tono adulto.
- **Existe:** metas con `recurrence`, `priority`, `status`, aportes vinculados, retiros. **Falta:** el estado calculado, la fecha estimada y el simulador.

### Deudas (Debt Control Center)

- **Responde:** ¿cuánto debo y a quién? ¿cuándo quedo libre? ¿cuánto pago en intereses? ¿cuál ataco primero? ¿qué ahorro con un abono extra?
- **Titular:** fecha libre de deudas con la estrategia activa. **Secundarios:** deuda total, cuota mensual total, tasa media ponderada, intereses restantes, ratio cuota/ingreso (existe, 32 % en la demo).
- **Visualizaciones:** una curva de saldo por deuda superpuestas con línea sólida (plan actual) y punteada (mínimo o escenario), crosshair compartido (E, `connect` con el gráfico de intereses acumulados) · comparador avalancha vs bola de nieve con la diferencia en ₡ y meses (existe) · desglose principal vs interés por cuota en el detalle (R barras apiladas) · simulador de abono extra mensual o único.
- **Existe:** casi todo (Priority Engine, calculadora, pagos con principal/interés, `recomputeFromPayments`). **Falta:** curvas superpuestas, escenario interactivo, y usar el saldo vivo en el panel. Toda proyección con nota «simulación con la tasa actual; no es asesoría».

### Inversiones (Investment Intelligence)

- **Responde:** ¿cuánto vale? ¿cuánto puse? ¿cuánto gané? ¿cuánto es aporte y cuánto crecimiento? ¿cómo está repartido y qué tan concentrado? ¿qué dividendos recibí?
- **Titular:** valor actual con estimación en vivo marcada (línea discontinua si el precio está en caché). **Secundarios:** capital aportado, ganancia no realizada (₡ y %), **TWR del periodo** con tooltip, dividendos 12 meses.
- **Fórmulas a documentar antes de mostrar:** retorno simple = (valor − aportes) / aportes; TWR = producto de (1 + rᵢ) por subperiodo entre flujos, con `portfolio_snapshots` diarios y `investment_transactions`; benchmark solo si se importa una serie de referencia (no existe hoy). **El +57 % YTD de la demo es un bug que hay que diagnosticar antes de cualquier gráfico nuevo:** probablemente compara contra un snapshot inicial incompleto.
- **Visualizaciones:** valor vs aportes acumulados (área + línea, E con dataZoom y selector 1m/3m/YTD/1a/todo) · barras aporte vs crecimiento por mes (R) · asignación por clase y por holding en barras ordenadas (R) con concentración «tu mayor posición es el 62 %» · tabla de holdings con sparkline y «desde compra».

### Protección

- **Responde:** ¿qué tengo cubierto? ¿cuánto pago en primas? ¿qué vence y cuándo? ¿qué riesgo queda sin cubrir?
- **Diseño:** mapa de cobertura por tipo (vida, salud, vehículo, hogar, otros) con estado cubierto / parcial / sin información, línea de tiempo de vencimientos 12 meses, prima mensual total como parte de Recurrentes, alertas 30/60 días antes de vencer. Fondos de emergencia y paz pasan a Planes · Fondos. Nota fija: «CARTERA+ organiza tu protección; no sustituye a un asesor de seguros».

### Patrimonio · Resumen (Wealth Overview)

- **Responde:** ¿cuánto tengo neto? ¿me hago más rico? ¿qué lo movió? ¿cómo está compuesto?
- **Titular:** patrimonio neto con variación vs cierre anterior y vs 12 meses, y el veredicto honesto de `closedWealthDelta` (dos meses cerrados o «en curso»). **Secundarios:** activos, pasivos, ratio A/P, meses de colchón.
- **Visualizaciones:** serie histórica de `net_worth_snapshots` con activos y pasivos apilados y la línea neta encima, brush para rango (E) · cascada «qué movió el patrimonio este mes» (ahorro, mercado, pago de deuda, nuevos activos) (E barras con signo) · composición por clase de activo y de pasivo en barras ordenadas (R) con drill a cuenta/activo/deuda.
- **Existe:** 12 snapshots, indicadores, composición. **Falta:** dibujar la serie (bug conocido), la cascada de contribución (derivable de la diferencia entre `breakdown` de snapshots consecutivos).

### Libertad

- **Significado actual (verificado):** el Rich Life engine calcula 14 indicadores y un score de 8 dimensiones ponderadas; la «escalera» muestra Seguridad (capital = gasto de referencia × meses) e Independencia (capital objetivo, en la demo ₡145 602 000 al 3 %). El termómetro compara ingreso pasivo con gasto de referencia.
- **Propuesta:** una pantalla con tres columnas claramente rotuladas **DATO REAL** (patrimonio, ahorro mensual, gasto de referencia) · **SUPUESTO** (rendimiento real, inflación, tasa de retiro; editables, con valores por defecto visibles) · **PROYECCIÓN** (años a Seguridad e Independencia, con banda de sensibilidad ±2 pts de rendimiento). Gráfico: capital proyectado vs objetivo con banda (E, línea + área de rango) y marcadores de hitos. Runway = liquidez / gasto de referencia. Nada se rediseña hasta validar las fórmulas del engine con Memo (sección 28).

### Indicadores, Asesor y Acciones

- **Indicadores:** series de tipo de cambio, tasas e inflación con «qué significa para ti»; entra al menú web; gráficos R con crosshair.
- **Asesor:** entrada contextual desde cada tarjeta (el prompt lleva el contexto del KPI), respuestas con mini gráfico cuando la pregunta es numérica, y las propuestas siguen pasando por `ReceiptConfirmCard`.
- **Acciones:** bandeja única con prioridad, impacto en ₡, «por qué» y evidencia; los módulos dejan de renderizar sus propias tarjetas de «próxima mejor acción» y muestran solo un enlace a la acción de su dominio.


