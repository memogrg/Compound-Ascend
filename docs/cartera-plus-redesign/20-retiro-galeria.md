# 20 · Retiro de la galería vieja de `/dev/ui` (delta 2.6c)

Con el catálogo de estados montado —2.6a (nueve primitivas de KPI y lectura) y 2.6b (siete
gráficos), los dos en ocho estados— la galería original pasó a dibujar por segunda vez cosas
que el catálogo ya muestra, y en menos estados. Dos dibujos de la misma primitiva no se
mantienen sincronizados: se separan, y el que mira no sabe cuál es el bueno.

Este documento dice, una por una, **qué se borró y qué se migró**, con el motivo.

## Lo que se borró (el catálogo lo muestra, y en más estados)

| Qué                                                               | Dónde estaba                        | Quién lo cubre ahora                                                                                                              |
| ----------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Fila de cuatro `KpiCard` en su estado feliz                       | sección 7 «KPI»                     | catálogo: `KpiCard` en los ocho estados (se migró **la fila**, ver abajo)                                                         |
| Gráfico de barras «Ingresos y gastos por mes»                     | sección 6 «Gráficos»                | catálogo: barras en los ocho estados, sobre el marco de verdad                                                                    |
| Gráfico de seis series «Gasto por sobre»                          | sección 6 «Gráficos»                | catálogo: las mismas series; la cuenta del tooltip («las 4 de mayor peso y el resto») la fija `tests/unit/charts-tooltip.test.ts` |
| Panel de controles duplicado (tema · ancho · movimiento · visión) | dentro de cada catálogo, dos copias | un solo panel, pegado arriba (`controles-catalogo.tsx`)                                                                           |

El panel duplicado no era solo repetición: dos paneles montados a la vez son dos grupos de
radios que el navegador puede tratar como uno si comparten el `name`. Ya pasó con la
simulación de visión —marcar en un bloque desmarcaba el del otro y el clic «no cambiaba el
estado»—. Con un panel único eso no puede volver.

## Lo que se migró (el catálogo NO lo cubría)

| Qué                                                                          | Por qué no lo cubre una matriz de estados                                                                                                                                                        | Dónde quedó                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| La **fila** de `KpiCard` (`#kpi-tarjetas`)                                   | lo que se rompe en rejilla es la alineación ENTRE tarjetas: el chip «vs …» bajando de línea solo en la del importe largo deja cuatro chips a alturas distintas. Una tarjeta suelta no lo muestra | catálogo 2.6a, entrada «KpiCard en rejilla»    |
| El **par sincronizado** (patrimonio + flujo)                                 | el crosshair de uno mueve el del otro: es una relación entre dos gráficos, no un estado de uno                                                                                                   | sección 6, ahora «Interacción de los gráficos» |
| **Clic fija / Escape suelta / flechas recorren**                             | son transiciones, no estados; una captura no las ve                                                                                                                                              | sección 6                                      |
| La **animación** de la cifra principal                                       | lo que hay que ver es el CAMBIO; un número quieto no demuestra que se anime                                                                                                                      | sección 7, ahora «Animación de la cifra»       |
| La **lectura enlazada** (sobre elegido → KPI de al lado → señales filtradas) | el foco de la pantalla atraviesa cuatro primitivas a la vez                                                                                                                                      | sección 8, ahora «Lectura enlazada»            |

Las tres secciones que quedan ya no se llaman como la primitiva que dibujan, sino como lo
que aportan: si el nombre dice «KPI», vuelve a invitar a mirar ahí lo que ya está en el
catálogo, y en dos versiones.

## Lo que no tocó este delta

`Calendario y zoom` (sección 11) no está en ningún catálogo de estados: es SVG propio, no
Recharts, y su interacción son los presets de rango por teclado. Se queda como está.
