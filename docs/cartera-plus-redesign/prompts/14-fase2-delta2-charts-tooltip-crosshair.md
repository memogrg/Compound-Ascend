# Prompt 2.2 — feat/charts-tooltip-crosshair

---

Fase 2 · Delta 2. Rama desde `main` (HEAD `2cda75bb`). Sin dependencias nuevas. Solo `charts/core/**`, `charts-core.css`, la sección Gráficos de `/dev/ui` y tests.

Crosshair sincronizado (`syncId` + `syncMethod="value"`), fijar con clic/tap, táctil con `touch-action` y anclaje arriba, `aria-live` del punto activo, delta vs comparación, tope de 4 filas, nota del punto y una sola función de fecha para eje y tooltip.

---

## Las props de Recharts, verificadas antes de escribir

Todas existen en 3.10 y con la semántica que hacía falta:

| prop | dónde | qué dice su tipo |
| --- | --- | --- |
| `active?: boolean` | `<Tooltip>` | «If `undefined`, **Recharts** will control when the Tooltip displays. This includes mouse **and keyboard** controls» |
| `defaultIndex?: number \| TooltipIndex` | `<Tooltip>` | índice inicial |
| `trigger?: 'hover' \| 'click'` | `<Tooltip>` | «If `click` then the Tooltip shows after clicking **and stays active**» |
| `position?: Partial<Coordinate>` | `<Tooltip>` | «se puede dar un solo eje y dejar que el otro se calcule» |
| `shared?: boolean` | `<Tooltip>` | todos los puntos del tick vs uno |
| `syncId?: number \| string` | `<*Chart>` | «Charts with the same syncId will synchronize **Tooltip and Brush** events» |
| `syncMethod?: 'index' \| 'value' \| fn` | `<*Chart>` | por defecto `index`; con longitudes distintas «this might yield unexpected results» |
| `onClick` | `<*Chart>` | entrega `MouseHandlerDataParam` con `activeTooltipIndex`, `activeLabel`, `activeCoordinate` |

## Lo que se hizo, y prevalece

**El fijado va con `active` + `defaultIndex`, no con `trigger="click"`.** `trigger="click"` **reemplaza** el hover en vez de sumarse: el tooltip dejaría de aparecer al pasar el ratón, que es el comportamiento principal. Con `active={undefined}` manda Recharts —hover y teclado, que es quien sabe de los dos— y solo cuando hay algo fijado se pasa `active={true}` + el índice. El control es la excepción, no el modo.

**`activeTooltipIndex` llega como CADENA, y el fallo era mudo.** La firma pública dice `number | TooltipIndex`, pero `TooltipIndex = string | null`: en la práctica entrega `"4"`. Con la guarda `typeof i === "number"` el clic no fijaba nada y no había error en consola, ni excepción, ni aviso — el tooltip simplemente no se quedaba. Se convierte en el borde (`Number(...)` + `Number.isInteger`) para que el estado y su reductor sigan hablando de números, que es lo que son.

**`syncMethod="value"`, no el `index` por defecto.** Los dos gráficos del par tienen 12 y 7 meses: con `index`, el punto 3 de uno se emparejaría con el punto 3 del otro aunque sean meses distintos. Con `value` casan por el valor del eje categórico —por eso las etiquetas van en ISO (`2026-04`) y se formatean al pintar—, y el gráfico corto **no inventa** un punto donde no tiene dato. Hay un test que apunta a un mes de 2025 y comprueba que el de Flujo se queda vacío.

**El grupo sincroniza el tooltip y el crosshair; el resaltado de serie NO cruza.** Está escrito en el JSDoc de `SYNC_METHOD` porque es la clase de cosa que alguien «arregla» después: señalar «Presupuesto» abajo no tiene por qué atenuar nada arriba, donde esa serie ni existe. Eso vive en `useSerieActiva`, que es de cada gráfico.

**`touch-action: pan-y`, no `none`.** `m-scrub-chart` usa `none` porque en `/m` el gráfico ocupa el ancho entero y no compite con nada. Un gráfico embebido en una página larga con `none` **se come el scroll vertical** y deja a la persona atrapada: no puede seguir bajando con el dedo sobre el gráfico. Con `pan-y` el gráfico se queda el gesto horizontal y devuelve el vertical. Hay un test que comprueba que la página sigue desplazándose.

**En puntero grueso el tooltip va ARRIBA, no bajo el dedo.** Debajo lo tapa la mano justo cuando se quiere leer. `posicionAnclada` centra sobre el punto y sujeta a los bordes —el mismo clamp que `m-scrub-chart` lleva tiempo usando en `/m`—, y si el tooltip es más ancho que el gráfico se pega a la izquierda, que es lo único que garantiza ver el principio del texto.

**El `aria-live` sale del TOOLTIP, no de un handler del chart.** `accessibilityLayer` mueve el índice con las flechas **sin disparar ningún evento de ratón**, así que un `onMouseMove` se perdería justo el caso que importa. El componente del tooltip es el único que ve el punto con los dos modos de entrada; lo emite como efecto, no durante el render, porque llamar al callback del padre mientras este se pinta es el bucle clásico de React.

**Y solo se anuncia en teclado.** Con el ratón ya se está viendo el tooltip; narrar cada punto al pasar por encima convierte el lector de pantalla en una alarma. El retardo de 150 ms es lo que hace que recorrer diez puntos no encole diez mensajes: se anuncia donde la persona se detuvo.

**El live region está SIEMPRE en el DOM.** Uno que se monta y se desmonta no se anuncia: el lector solo observa lo que ya estaba cuando empezó a mirar.

**El delta se colorea por dirección × `sentidoBueno`, y el signo va siempre.** En ingresos subir es bueno y en gastos es malo, así que el color no puede salir del signo. Y el color nunca es el único canal: el `+` o el `−` van delante (WCAG 1.4.1). Un gasto que baja se ve verde **y** con menos.

**`anterior = 0` o nulo no produce un porcentaje.** Dividir por cero daría `Infinity` y un «+∞ %» en pantalla. Un cambio desde cero es «apareció», no «creció un infinito por ciento»: se escribe el guion. Y el porcentaje se calcula sobre la MAGNITUD del anterior, o una deuda que mejora de −100 a −50 saldría como «−50 %».

**El tope de 4 filas ordena por peso pero muestra en orden de declaración.** Si el tooltip se ordenara por valor, cada punto reordenaría la lista y sería imposible seguir una serie moviendo el ratón. Se eligen las 4 de mayor valor absoluto —un gasto de −800 pesa tanto como un ingreso de 800— y se pintan en el orden de la leyenda. La tabla del marco sigue completa: recortar es legibilidad, no censura.

**Una sola función de fecha.** `formatoEjeX` se usa en el `tickFormatter` del eje **y** en la cabecera del tooltip de las cuatro muestras. Que el eje diga «ago 26» y el tooltip «2026-08-01» es el defecto más común de un gráfico y el más fácil de colar: son dos formateadores escritos en sitios distintos.

## Lo que costó una corrida entera

**`boundingBox()` da coordenadas del viewport.** Los gráficos de `/dev/ui` están muy por debajo del pliegue, así que la primera sonda movía el ratón a un sitio donde no había nada y todo salía en cero. Todos los helpers del spec empiezan con `scrollIntoViewIfNeeded`.

**El eje Y no es área de trazado.** Apuntar a `caja.x + 6` cae sobre las etiquetas del eje (56 px), donde Recharts no activa ningún punto. El test que comprueba el mes no compartido apunta dentro de `.recharts-cartesian-grid`.
