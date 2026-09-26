# 15 · Cierre de mes: materializar y congelar, con estimado para lo que ya pasó

**Plan aprobado por Memo (A + B). No implementado todavía.**
Continúa [14 · El presupuesto de los meses pasados](14-presupuesto-meses-pasados.md), que compara
las dos opciones; aquí se dan por decididas y se escribe cómo se hace.

---

## El problema, en una línea

Las partidas **derivadas** del presupuesto —`debt`, `goal`, `policy`, `recurring`, `holding`,
`rental`— solo existen en el mes en curso y en los futuros que alguien visite. Los meses
cerrados tienen lo `manual` y nada más, así que el histórico muestra un presupuesto que cae en
picado el mes pasado sin que nada haya cambiado en la vida del usuario.

No es un bug: es el guard del PR #819, que existe porque **una lectura escribía** y abrir un mes
viejo le fabricaba partidas con los montos de HOY.

---

## A · El cron materializa y CONGELA el mes cerrado

### Dónde

`/api/base/snapshot`, cron `0 6 1 * *`. Ya recorre a todos los usuarios con el cliente de
servicio y ya calcula el mes recién cerrado con `previousMonthPeriod(...)`. No hace falta cron
nuevo, ni secreto, ni calendario: se compone ahí, igual que ya se compone el snapshot de
patrimonio.

### Qué significa «congelar»

Que sobre un mes cerrado **solo se inserta**. Nunca `update`, nunca `delete`.

Esto no es un detalle de implementación, es la razón de ser de A. Hoy `diffDerived` reconcilia:
actualiza la línea cuyo monto cambió y borra la línea cuya entidad desapareció. Sobre un mes
cerrado eso **reescribe la historia en vez de fijarla** — saldar una deuda borraría la línea que
prueba que ese mes se presupuestó, y bajar una cuota reescribiría lo que se presupuestó hace
cuatro meses. Un presupuesto congelado que se puede editar no es un presupuesto congelado.

Y el congelado tiene que ser **del periodo**, no del llamador: si vive en el llamador, el
próximo que llame sin saberlo vuelve a abrir la puerta.

### Los cuatro obstáculos, en orden de coste

1. **`syncDerivedBudget` está atada a la sesión.** Arranca con `requireUser()` y
   `createSupabaseServerClient()` (cookies). El cron no tiene sesión. Todas sus consultas ya
   filtran por `user.id`, así que parametrizar el id e inyectar el cliente es mecánico, pero
   toca las siete consultas de entidades más las dos de dividendos. Es el grueso del trabajo.
2. **`diffDerived` necesita un modo congelado** que devuelva solo `toInsert`, y que además no
   inserte nada si el periodo ya tiene alguna línea derivada (idempotencia del cron ante
   reintentos). Es una función pura: barata de escribir y de probar en rojo primero.
3. **Renta y dividendos llaman con meses pasados a propósito.** `rental-service.ts:107` y
   `dividend-service.ts:163` pasan el mes del PAGO, que puede ser pasado, porque necesitan el
   `id` de la línea materializada para su `income_source_id`. Con el congelado dejarían de
   obtenerla. Necesitan un camino dirigido —«asegurá **esta** línea de **esta** entidad en
   **este** mes»— en lugar de un sync completo.
4. **La hora del cron.** Corre a las 06:00 UTC del día 1 y ancla el mes cerrado en UTC, a
   propósito, porque es un job de sistema. Para un snapshot eso es tolerable; para un
   presupuesto que se congela no: en UTC−7 y más al oeste el usuario todavía está en el último
   día del mes cuando el job lo declara cerrado, y seguiría gastando dentro de un mes ya
   congelado. Se resuelve corriendo a las 12:00 UTC o anclando el periodo en la zona del
   usuario, que ya se sabe leer (`lib/time/user-time`).

### Qué NO arregla A

Los meses ya cerrados **antes** de que esto entre en producción. Se quedan sin partidas para
siempre: la historia empieza el mes en que el cron corre por primera vez, con un escalón visible
en el borde. Para eso está B.

---

## B · Estimado al leer, para los meses cerrados SIN partidas

### La regla

Si un mes cerrado no tiene partidas derivadas, se **estima** con los compromisos actuales y se
**rotula «estimado»**. Si las tiene, mandan ellas y no hay estimado: la línea persistida gana
siempre.

### Dónde

`expense-jars-service.getEntityFallbackBudgetPorPeriodo(periods, currency)` ya hace exactamente
esto para `holding` y `rental`: lee el catálogo de entidades y los tipos de cambio **una vez**
para todo el rango y por mes solo consulta lo que depende del mes. Extenderlo a `debt`, `goal`,
`policy` y `recurring` completa B: un servicio y una función pura.

### El rótulo NO es opcional

Un estimado sin rotular es el bug de #819 servido en la capa de lectura: el número se mueve solo
—pagá una deuda hoy y junio pierde ₡312.180 retroactivamente— y el usuario no tiene forma de
saberlo. Va rotulado en los **tres** sitios donde aparece:

- **Gráfico**: la marca de presupuesto de un mes estimado va punteada, y la leyenda suma
  «Presupuesto estimado». Mismo criterio que el mes parcial: el color no puede ser el único
  canal (WCAG 1.4.1).
- **Tabla**: la fila lleva «· estimado» junto al mes, igual que hoy lleva «· parcial».
- **KPI**: si el rango incluye algún mes estimado, el subtítulo lo dice («de 6 meses · 4
  estimados»). Sin eso, el titular suma manzanas con peras sin avisar.

---

## División en PR

Cuatro, en este orden. Cada uno entra solo y deja el árbol verde.

### PR 1 · `diffDerived` aprende a congelar *(solo motor, sin efecto visible)*

- `diffDerived(existing, desired, { congelado })` → con `congelado`, solo `toInsert`, y vacío si
  ya hay alguna derivada en el periodo.
- **Tests (rojo primero):** con `congelado`, un monto cambiado NO produce `toUpdate`; una entidad
  desaparecida NO produce `toDeleteIds`; un periodo que ya tiene derivadas no produce nada;
  sin `congelado` el comportamiento actual no cambia (el caso que protege lo que ya funciona).
- **Riesgo:** ninguno. Nadie pasa `congelado` todavía.

### PR 2 · `syncDerivedBudget` sin sesión *(refactor, sin cambio de comportamiento)*

- `syncDerivedBudget(period, ctx?)` con el patrón `AuthContext` que ya usan
  `holdings-service` y `snapshot-service` (`resolveAuth(ctx)`), en vez de inventar otro.
- **Tests:** los existentes siguen pasando sin tocarse; uno nuevo con `ctx` de service-role que
  comprueba que escribe para el usuario que se le pasa y para ningún otro.
- **Riesgo:** medio. Es el PR que toca más líneas. Mitigación: no cambia ni una decisión, solo
  de dónde salen el cliente y el id.

### PR 3 · El cron materializa *(el cambio de verdad)*

- `/api/base/snapshot` compone la materialización del mes cerrado, después del snapshot de la
  base y del de patrimonio, y **best-effort**: un fallo aquí no puede tumbar los snapshots, que
  ya están escritos.
- El periodo se ancla en la zona del usuario; el cron pasa a las 12:00 UTC.
- Camino dirigido para renta y dividendos.
- **Tests:** de integración contra la BD de pruebas (patrón `tests/rls`): un usuario con tres
  deudas y dos metas, correr el job, comprobar las cinco líneas en el mes cerrado con su
  `source_kind`/`source_id`; **correrlo dos veces y comprobar que no duplica**; cambiar una
  cuota, correrlo otra vez y comprobar que la línea del mes cerrado **no cambia**.
- **Riesgo:** el más alto de los cuatro, porque escribe para todos los usuarios. Mitigación:
  entra con la escritura detrás de una bandera de entorno, se mira una corrida en producción con
  la bandera apagada (solo logs: «habría escrito N líneas para M usuarios»), y se enciende
  después.

### PR 4 · El estimado al leer, rotulado

- Extender `getEntityFallbackBudgetPorPeriodo` a las cuatro fuentes que faltan.
- `MesPresupuestado` gana `estimado: boolean`, que viaja hasta el gráfico, la tabla y el KPI.
- **Tests (rojo primero):** un mes CON partidas no se estima (la persistida gana); un mes sin
  ellas se estima y llega marcado; en el navegador, que la marca punteada y el «· estimado»
  aparezcan donde toca y **no** donde no toca.
- **Riesgo:** bajo y reversible quitando el fallback.

---

## Orden de despliegue

```
PR 1  →  PR 2  →  PR 3 (bandera apagada)  →  observar una corrida  →  bandera encendida  →  PR 4
```

PR 4 va al final a propósito: mientras el cron no haya corrido nunca, **todos** los meses
cerrados serían estimados y la pantalla se llenaría de rótulos. Con el cron ya funcionando, el
estimado queda para el borde histórico, que es su sitio, y va desapareciendo mes a mes.

**Si hace falta migración, va DESPUÉS del código.** La base nunca se adelanta: una columna nueva
que el código todavía no escribe es inerte, pero un código que espera una columna que no existe
tumba la pantalla — y así se ve, de hecho, en QA local ahora mismo, donde `investment_holdings`
no tiene las columnas `payout_*` que el código selecciona y `/patrimonio` muestra ₡0 (ver
[16 · Snapshots de patrimonio](16-snapshots-patrimonio.md)).

Ninguno de los cuatro PR necesita migración, en principio: `budget_items` ya tiene
`source_kind`/`source_id` y el índice único parcial `uq_budget_items_derived` que hace el sync
idempotente. Si al implementar PR 4 se decide **persistir** la marca de estimado en vez de
derivarla al leer, esa sí sería una migración, e iría en un PR posterior al que la escribe.

---

## Cómo se sabrá que funcionó

- El 1 del mes siguiente al despliegue, un mes cerrado con sus derivadas para todos los usuarios
  que las tenían en el mes en curso.
- Ese mes **no cambia** cuando el usuario salda una deuda.
- `/gastos` y Mi Base Financiera siguen diciendo lo mismo para el mes en curso (ya hay un caso
  que lo compara en vivo, en `tests/a11y/gastos-historico.spec.ts`).
- El escalón del borde se mueve un mes por mes, en vez de quedarse quieto.
