# CARTERA+ · Rediseño UX — Framework de dashboards

_Extraído del blueprint maestro (16-sep-2026). Fuente viva: https://claude.ai/code/artifact/0e037de8-78ec-44fd-b4ef-3ea701eea331_

## 9. Dashboard strategy

Todo dashboard de CARTERA+ cuenta la misma historia en el mismo orden: **qué pasa → por qué → dónde → cómo cambia → qué investigar → qué hacer**. Se materializa en una plantilla única de seis franjas con altura y jerarquía fijas, para que el usuario aprenda a leer una pantalla y sepa leer todas.

| Franja | Pregunta | Componente compartido | Peso visual | Regla |
| --- | --- | --- | --- | --- |
| 1 · Titular | ¿Qué pasa? | `KpiHero`: un número grande (36-44 px, `tabular-nums`, animado con NumberFlow), su comparación (± vs periodo anterior o vs plan) y una frase de lectura sin juicio | Máximo | **Un solo KPI principal por pantalla** |
| 2 · Contexto | ¿Por qué? | `KpiRow`: 3-4 `KpiCard` secundarias (número 20-24 px + delta + sparkline opcional) | Medio | Sin tarjetas dentro de tarjetas; misma altura |
| 3 · Explicación | ¿Dónde y cómo cambia? | `ChartCard` principal (altura fija 320 px escritorio / 220 px móvil) con toolbar: comparar, ver tabla, exportar | Alto | Hover + crosshair + clic → drill-down |
| 4 · Desglose | ¿Dónde exactamente? | `BreakdownCard`: barras ordenadas o treemap con el % del total; clic filtra las demás tarjetas (interacción enlazada) | Medio | Nunca una dona como único desglose |
| 5 · Señales | ¿Qué investigar? | `InsightList`: 1-3 hallazgos determinísticos con cifra, causa y enlace a la evidencia | Medio | Verificables y trazables, nunca alarmistas |
| 6 · Acción | ¿Qué hacer? | `ActionStrip`: la acción del dominio (aportar, ajustar sobre, pagar extra) + «preguntar al asesor» | Medio | Enlaza al hogar único de acciones |

**Qué responde cada dashboard (el KPI titular y las tres preguntas que siguen):**

| Dashboard | KPI titular | Comparación | Preguntas 2-4 |
| --- | --- | --- | --- |
| Hoy · Panel | Libre para gastar este mes | vs ritmo ideal del mes | ¿Me hago más rico? · ¿Qué debo hacer? · ¿Qué viene? |
| Flujo · Resumen | Flujo libre del periodo | vs presupuestado y vs periodo anterior | ¿Ingresos y gastos vs plan? · ¿Liquidez? · ¿Tendencia 12 meses? |
| Flujo · Ingresos | Ingreso del periodo | vs esperado (fuentes recurrentes) | ¿De dónde? · ¿Qué tan estable? · ¿Cuándo entra? |
| Flujo · Gastos | Gasto del periodo | vs presupuesto y vs promedio 3 meses | ¿En qué sobres? · ¿Qué comercios? · ¿Qué cambió o es anómalo? |
| Flujo · Recurrentes | Compromisos de los próximos 30 días | vs mes anterior | ¿Qué ya se pagó? · ¿Qué falta? · ¿Qué subió? |
| Planes · Metas | Aporte necesario este mes | vs aportado | ¿Cuáles van al día? · ¿Cuándo llego? · ¿Qué pasa si aporto más? |
| Planes · Deudas | Fecha libre de deudas | vs plan mínimo | ¿Cuánto pago en intereses? · ¿Cuál ataco primero? · ¿Qué ahorro con un abono extra? |
| Patrimonio · Resumen | Patrimonio neto | vs cierre del mes anterior y hace 12 meses | ¿Activos vs pasivos? · ¿Qué lo movió? · ¿Composición y concentración? |
| Patrimonio · Inversiones | Valor actual | vs capital aportado | ¿Rendimiento (TWR)? · ¿Asignación? · ¿Aportes vs crecimiento? |
| Patrimonio · Protección | Meses de colchón + cobertura | vs objetivo | ¿Qué pólizas? · ¿Qué vence? · ¿Qué riesgo queda sin cubrir? |
| Patrimonio · Libertad | % del capital objetivo | vs hace 12 meses | ¿Cuántos años faltan? · ¿Qué supuestos? · ¿Qué palanca acerca más? |

**Prueba de 5 segundos** (se aplica a cada prototipo antes de aprobarlo): el usuario debe poder decir dónde está (título + pestaña), qué pasa (titular), cuál es el dato importante (solo hay uno grande), si va bien o mal (color + delta + frase) y qué puede explorar (gráfico con affordance de clic). Si hay que leer más de tres números para responder, la jerarquía falla.

**Formato financiero único:** `Intl.NumberFormat('es-CR')` (₡1 234 567, coma decimal, espacio duro como separador), USD con símbolo estrecho, `notation: 'compact'` en ejes (₡1,2 M), `signDisplay: 'exceptZero'` en deltas, y `font-variant-numeric: tabular-nums` en toda cifra. Se centraliza en `src/lib/format.ts` (ya existe) y se prohibe formatear a mano.



## 10. Dashboard master proposal

El panel Hoy responde una sola pregunta en el titular, «¿cuánto puedo gastar sin desviarme?», y debajo las tres que la explican: si me hago más rico, qué debo hacer y qué viene. Pasa de siete bloques iguales a seis franjas con jerarquía; la composición de gastos, el hub de configuración completado y las perspectivas genéricas salen del Home.

| Franja | Contenido | Fuente de datos (existe) | Interacción |
| --- | --- | --- | --- |
| 1 · Titular | **Libre para gastar este mes**: ₡ grande + frase («vas ₡ 42 000 por encima del ritmo ideal») + mini gráfico ritmo ideal vs real (línea punteada vs sólida, día de hoy marcado) | `BaseSummary` (ingresos y gastos del mes), `budget_items` recurrentes, `debt_payments` y aportes planificados | Hover en el gráfico muestra el día; clic → Flujo · Gastos; tooltip «?» con la fórmula |
| 2 · Contexto | 3 tarjetas: **Patrimonio neto** (± vs cierre anterior, con veredicto honesto «en curso» si no hay dos meses cerrados) · **Flujo del mes** (ingresos − gastos reales, vs plan) · **Compromisos próximos 14 días** (monto y cantidad) | `RichLifeIndicators.closedWealthDelta`, `BaseSummary`, recurrentes | Cada tarjeta enlaza a su núcleo con el periodo activo |
| 3 · Acciones | **Tu próxima mejor acción** (una, con su porqué y su impacto en ₡) + hasta 2 pendientes más + contador «ver las N acciones» | Motor de Mis acciones (`getSurplusDecision`, Priority Engine, insights) | Hacer / posponer / preguntar al asesor; enlaza a Hoy · Acciones |
| 4 · Señales | 1-3 **cambios relevantes** del periodo: anomalía, sobre en riesgo («78 % usado, 52 % del mes»), ingreso variable mayor, aporte pendiente | `src/lib/insights` (campana) con severidad | Cada señal lleva a su evidencia (transacciones filtradas o el sobre) |
| 5 · Viaje | Franja compacta del riel: etapa actual, siguiente hito y % del capital de libertad | `stage-rail` + Rich Life score | Enlaza a Hoy · Progreso |
| 6 · Registro | Acceso rápido: registrar gasto · ingreso · escanear · «por revisar (N)» | `quick-add`, `ingest_proposals` | Abre el composer o Transacciones |

**Fórmula del titular (documentada para `financial_integrity`):**

- `libre_para_gastar = ingreso_esperado_mes − gasto_real_a_hoy − compromisos_pendientes_mes`
- `ingreso_esperado_mes` = suma de `budget_items` de ingreso del periodo (recurrentes agendados por `ensureRecurringIncome`), o el ingreso real si ya superó lo esperado.
- `compromisos_pendientes_mes` = cuotas de deuda no pagadas del mes + aportes DCA/metas planificados no ejecutados + líneas de sobres fijos (`source_kind ≠ 'manual'` y recurrentes) aún sin transacción.
- Supuestos visibles en el tooltip: ingresos quincenales hacen que el ritmo ideal no sea lineal, por lo que la línea ideal se construye con las fechas de cobro esperadas cuando existen y con una recta cuando no.
- Casos borde: mes recién abierto (día 1-2) → se muestra el número con etiqueta «mes recién iniciado» y sin veredicto; sin presupuesto → el titular pasa a «Flujo del mes» y la señal invita a repartir el presupuesto.

**Qué se evaluó y NO va en el Home:** savings rate y ratio gasto/ingreso (van en Flujo · Resumen), presupuesto consumido por sobre (Gastos), proyección al cierre (Flujo · Resumen, aunque el titular ya la implica), objetivos individuales (Planes), detalle de deuda (Planes), inversiones y rendimiento (Patrimonio), alertas de precio (Patrimonio · Inversiones), composición de gastos por naturaleza (Gastos), Salud financiera con sus 6 barras (Hoy · Progreso). El criterio: el Home muestra lo que cambia cada día y lo que exige una decisión; todo lo demás vive a un clic.

**Móvil:** mismas seis franjas en una columna; el titular ocupa la primera pantalla completa con el gráfico de ritmo; el registro rápido es el botón flotante.

**Corrección previa obligatoria:** el diagnóstico de deuda del panel lee el ancla (`debts.balance`) en vez del saldo vivo (`recomputeFromPayments`), lo que produce la alerta falsa de la tarjeta BAC. La rama `claude/agitated-wescoff-65711d` ya lo corrige; debe mergearse antes del rediseño del Home.


