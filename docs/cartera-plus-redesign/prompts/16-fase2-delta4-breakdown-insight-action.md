# Prompt 2.4 — feat/breakdown-insight-action (desglose, señales y acción)

---

Fase 2 · Delta 2.4. Sin dependencias nuevas. Solo `src/components/lectura/` (nuevo), su hoja `src/styles/lectura.css` (prefijo `lec-`), la sección nueva de `/dev/ui` y tests. No se tocan `jar-row`, `observations`, `bell-notifications`, `action-*`, `MSectionHeader` ni `/m`: la migración de pantallas es de la fase 3.

`SectionHeader` (título, nivel, eyebrow, ayuda en tooltip, toolbar) · `BreakdownCard` (barras ordenadas, `plegarOtros`, `porcentajesExactos`, selección controlada, drill-down con breadcrumb) · `InsightList` (1-3 hallazgos, `desdeInsight` desde `ACTIONS`) · `ActionStrip` (`desdeAction`, bloqueo, asesor, hogar único). Demo encadenada en `/dev/ui`.

---

## La regla que ordena todo el delta: un control no va dentro de otro

Las cuatro piezas se diseñaron alrededor de un dato del pre-flight: los **44 nodos de
`nested-interactive`** de la línea base están todos en un sitio —`transactions-browser.tsx:390`,
una fila `role="button"` con un `<button>` de acciones dentro— y en ninguno de los componentes
que estas primitivas reemplazan.

De ahí salen dos decisiones que se ven raras hasta que se sabe por qué:

- **Cada fila del desglose es UN solo `<button>`** y no contiene nada interactivo. El «Ver
  detalle» del drill-down vive **fuera** de la fila, como hermano, y solo aparece cuando esa
  fila está seleccionada. Por eso el drill-down es «seleccionar y después pulsar», no doble clic:
  el doble clic no tiene equivalente de teclado y obligaría a meter un control dentro de la fila.
- **En `InsightList`, «Descartar» es hermano del enlace**, con el patrón que ya usa
  `bell-notifications.tsx:207-225`. Hay un test que lo fija (`a button, button a` → 0 nodos).

## Decisiones

**Barras, no dona.** Regla del blueprint (§9, franja 4). Una dona obliga a comparar ángulos, que
es lo que peor hace el ojo; una barra ordenada se lee de arriba abajo y el orden ya es media
respuesta.

**Los porcentajes suman exactamente 100**, por el método del mayor resto. Redondear cada uno por
su cuenta da 99 con una facilidad que sorprende —tres tercios dan 33+33+33— y un desglose cuyos
porcentajes no suman 100 es lo primero que alguien nota. El desempate va al primer índice, a
propósito: si no fuera determinista, las capturas de QA parpadearían.

**Un desglose PARCIAL no se fuerza a 100.** Lo encontró un test: con un total explícito mayor que
la suma de las filas —30 de un total de 100—, repartir los puntos que faltan convertía el 30 % en
un 31 %. Cuando la base no son estas filas, se redondea cada una y la suma queda por debajo, que
es justo lo que el dato dice.

**«Otros» se pliega desde la séptima, no desde la sexta.** Reemplazar una fila real por un «Otros»
que contiene una sola cosa esconde su nombre sin ahorrar sitio. Y «Otros» conserva las plegadas
como `hijos`, así que el detalle sigue a un clic.

**El color sale del dato y «Otros» no hereda ninguno.** Es la misma regla que el
`fix/m-color-por-entidad` de este mismo día; sin color propio, el fallback es `--muted-2`, nunca
un color prestado del vecino.

**`accionar` no es rojo.** La regla es «verificables y trazables, nunca alarmistas»: el rojo se
reserva para lo que ya salió mal (una deuda, un sobregiro), y una señal es lo contrario — algo que
todavía se puede atender. `accionar` y `observar` van en advertencia; `celebrar`, en acento. El
color nunca va solo: cada fila lleva ícono y un texto `sr-only` con la severidad en palabras.

**Los destinos salen de `ACTIONS`, no de un mapa nuevo.** `desdeInsight` lee
`suggestedAction(kind)` de `lib/insights/actions.ts`, que ya cubre los 26 tipos. Abrir un segundo
mapa acá sería repetir lo que le pasó a `KIND_HREF` de la campana, que lleva cinco tipos en
paralelo y se quedó atrás (anotado en el backlog).

**Una acción bloqueada no pinta botón.** Se explica por qué no se puede y ya: ofrecer un control
que no hace nada es peor que no ofrecerlo. Es la regla que ya aplica `action-card.tsx`, heredada
en vez de reinventada.

**La pregunta al asesor viaja por `?consulta=`,** que `/asistente` ya sabe leer
(`asistente/page.tsx`): deja el texto escrito sin enviarlo. No se inventó un parámetro nuevo.

**La ayuda va en tooltip, nunca en un párrafo.** Se usa `HelpTip` y no el `data-tip` de
`tooltip-layer.tsx`: los dos posicionan con @floating-ui, pero solo `HelpTip` pone
`role="tooltip"` con `aria-describedby` y abre con el foco del teclado.

**El nivel del encabezado es un parámetro.** Dentro de una página el orden de `h2`/`h3` lo manda
la jerarquía del documento; una primitiva que fijara `h2` rompería el esquema en cuanto la sección
viviera dentro de otra.

## Dos fallos que encontró una captura, no un test

**La selección controlada quedaba obsoleta al cambiar de nivel.** El reducer limpia la suya, pero
cuando la selección la manda el padre, un id del nivel anterior no existe en el siguiente: ninguna
fila lo iguala, así que `activa !== null` y **todas** salían atenuadas. Se veía como un nivel
entero en gris sin nada seleccionado. El test original solo miraba `aria-pressed` y pasaba; ahora
comprueba además que no quede ninguna fila con `data-atenuada`.

**A 390 las etiquetas se cortaban a «A..», «P..», «F..».** Con el nombre compitiendo por el mismo
renglón que dos números tabulares, lo que se sacrifica siempre es el nombre — y un desglose de
iniciales no desglosa nada. Por debajo de 420 px el importe y el % bajan a su propia línea. Se
arregló en los dos lados: la primitiva no depende de que su contenedor sea ancho, y la demo
colapsa a una columna cuando las dos no caben.

## Nota de método: el `lint` local mide otra cosa

`npm run lint` da 30539 problemas / 5960 errores, y esa cifra se venía usando como el listón. Al
mirarla de cerca: **5960 de los 5962 errores vienen de `.claude/worktrees/`**, copias del repo que
están en `.gitignore` y que CI nunca ve. El repo en sí tiene **0 errores**. La cifra sigue siendo
útil como detector de cambio —si sube, algo pasó— pero el número que importa es el de CI.
