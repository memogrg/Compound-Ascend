# CARTERA+ · Rediseño UX — Estado actual en producción (capturas del 16-sep-2026)

Cuenta demo Familia Ramírez (José Ramírez) en `carteraplus.aitechumbrella.com`, viewport 868 × 1377 px (tablet/escritorio angosto), tema claro. Las 18 capturas están en `estado-actual/`. Septiembre estaba vacío (resiembra del 1-sep), por lo que Base, Ingresos y Gastos se capturaron con `?period=2026-08`.

## Hallazgos por pantalla (lo que las capturas prueban)

| # | Pantalla | Captura | Qué se ve | Tipo |
| --- | --- | --- | --- | --- |
| 1 | Centro de mando | `01`, `02` | **Cinco tarjetas de alerta apiladas arriba**, una de ellas falsa («Tarjeta BAC Visa ₡1 850 000 al 45 %», saldo real ₡0). Debajo, el hub de configuración (2/4) y recién después las cifras. | Jerarquía + integridad |
| 1b | Centro de mando | `02` | «Tendencia patrimonial: **Te hiciste más rico**» con la cifra **−₡141 905** en verde. Salud financiera 97 «Ratio de deuda 0 %» mientras la tarjeta Deudas dice «32 % de tu ingreso». «Tienes margen de maniobra: te quedan ₡0». Composición de gastos (donut) en el Home. | Integridad + copy |
| 2 | Mis acciones | `03` | Buen concepto (acción 1 con brecha, decisión abonar vs invertir). La acción 02 es la misma alerta falsa de la tarjeta BAC. Riel de etapas al pie, lejos del panel. | Duplicación |
| 3 | Mi Base Financiera (sep) | `04` | Mes vacío: «Ingresos reales ₡0 · −100 % vs presup.», «Presión Media» con ₡0 de datos, seis gráficos en skeleton. Ocho métricas con el mismo peso. | Estados + jerarquía |
| 4 | Mi Base Financiera (ago) | `05` | Con datos: 8 KPIs iguales, gráficos A/B/C aún en skeleton tras 3 s (ver hallazgo transversal). Liquidez ₡1 354 594 como primer número aunque no responde la pregunta del mes. | Jerarquía |
| 5 | Ingresos (ago) | `06` | KPIs correctos (planificado ₡1 930 000, real ₡1 924 500). Gráficos en skeleton; el donut deja su leyenda huérfana. Sin esperado vs real por fuente ni calendario. | Gráficos |
| 6 | Gastos (ago, 6 m) | `07`, `08` | Tres avisos «casi no usás…» sobre sobres vinculados (deudas, aportes) que en realidad sí se pagan. «Gasto planificado ₡6 473 862 vs real ₡10 067 946 · **156 %**»: el rango de 6 meses mezcla cuotas y aportes con el presupuesto de sobres. Sparkline de ₡2 M contra línea de presupuesto de ₡6 M (escalas incompatibles). Donut de 24 categorías con leyenda de 24 filas. | Integridad + chart junk |
| 7 | Transacciones (sep) | `09` | Mes vacío sin estado vacío útil («Sin resultados para tu búsqueda»); liquidez repetida arriba; sin totales de filtro ni chips. | Estados |
| 8 | Ahorro | `10` | **Desborde horizontal**: «Agregar objetivo» y «₡203.9…» cortados a 868 px. Score 90 + «Tu próxima mejor acción» (tercera copia). Metas sin estado al día / en riesgo ni fecha estimada. | Responsive + duplicación |
| 9 | Deudas | `11` | La mejor pantalla: deuda total, fecha libre feb 2031, avalancha vs bola de nieve, orden de ataque. Pero el gráfico de saldo proyectado sigue en skeleton tras 6 s y la tarjeta saldada aparece en la lista como «₡0 de ₡1 850 000». | Gráficos |
| 10 | Portafolio | `12` | «**Rendimiento del periodo +₡1 012 178 · +56 %**» junto a «Rentabilidad acumulada +₡114 083 · 4 %» sobre ₡2,7 M invertidos. Los dos donuts de distribución nunca renderizan (solo la leyenda «100 %»). «Tu cartera está concentrada: Acciones pesa 100 %» cuando son dos CDP. | Integridad |
| 11 | Protección | `13` | Correcta y legible; fondos de emergencia y paz viven aquí aunque son metas. Puntuación 20 «expuesto» con 5 brechas. | IA |
| 12 | Patrimonio (Rich Life) | `14` | «Te estás haciendo más rico» + «−₡141 905 en lo que va del mes» (misma contradicción del Home). Sin serie histórica pese a 13 snapshots. Escalera Seguridad 3 % / Independencia 2 % correcta. 14 indicadores en tarjetas iguales. | Integridad + gráficos |
| 13 | Indicadores | `15` | Seis series del BCCR, **todas en skeleton hasta que el usuario hace scroll** (medido: 0 gráficos a los 20 s; 11 gráficos 3 s después de un scroll). No está en el menú web. | Rendimiento |
| 14 | Perfil financiero | `16` | Arquetipo, perfil de riesgo y lectura en números: bien resuelto; mezcla identidad con «tu próxima jugada» (cuarta copia). | Duplicación |
| 15 | Asistente | `17` | Pantalla casi vacía a 868 px: el chat ocupa 20 % y el resto es blanco; sugerencias al pie. Sin entrada contextual desde tarjetas. | Layout |
| 16 | Configuración | `18` | Cuenta, referidos, memoria, plan, moneda, TZ, hogar: correcto. Duplica «Mi configuración» (asistentes) con un botón. | IA |
| — | Todas | — | Banner permanente de Términos y Privacidad («Aceptar») tapando el pie de cada pantalla. | Global |

## Hallazgos transversales (nuevos respecto al blueprint)

1. **Los gráficos aparecen tarde o solo tras interacción.** En Indicadores: 0 gráficos a los 20 s con los 31 chunks ya descargados y sin errores de consola; 11 gráficos 3 s después de un scroll. En Gastos y Portafolio, el skeleton persiste entre 3 y 9 s. Hipótesis a verificar en `next build` local: hidratación diferida de las fronteras `dynamic({ ssr:false })` de `lazy.tsx` (React 19 prioriza la hidratación por interacción) y/o cálculo pesado en el primer render. Es un P1 de rendimiento percibido: el usuario ve cajas grises exactamente donde prometemos «gráficos premium».
2. **Copy que contradice al número** («Te hiciste más rico» con −₡141 905): el veredicto usa dos meses cerrados y la cifra usa el mes en curso; hay que rotular «en lo que va del mes» sin veredicto (ya previsto en `closedWealthDelta`, pero la UI no lo refleja).
3. **El rango de 6 meses en Gastos compara peras con manzanas**: el «planificado» suma sobres y el «real» suma sobres + cuotas + aportes. Cualquier KPI de rango debe usar el mismo universo en ambos lados.
4. **Desborde horizontal en Ahorro a 868 px**: el grid de cabecera no envuelve; hay más anchos rotos entre 768 y 1024 px de los que documentan los 6 breakpoints.
5. **Cuatro copias de «Tu próxima mejor acción» confirmadas en pantalla** (Home, Mis acciones, Ahorro, Perfil) más la de Portafolio en código.

Estas capturas son la línea base visual «antes» del rediseño y se comparan contra `qa-snapshots/base` cuando exista (prompt 0.3).
