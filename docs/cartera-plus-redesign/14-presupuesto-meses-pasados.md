# 14 · El presupuesto de los meses pasados

**Estado: decisión pendiente de Memo. Nada de esto está implementado.**
Diagnóstico de solo lectura + comparación de dos opciones. No se escribió sobre ningún
usuario real.

---

## 1. Qué pasa hoy

Las líneas de presupuesto **derivadas** de entidades —`source_kind` `debt`, `goal`,
`policy`, `recurring`, `holding`, `rental`— no existen en los meses cerrados. Solo el mes
en curso (y los futuros que se visiten) las tiene. Los meses pasados quedan con lo
`manual` y nada más.

No es un bug: es la consecuencia buscada de un arreglo anterior.

### La cadena

`syncDerivedBudget(period)` (`financial-base/services/derived-budget-service.ts:162`) lee
las siete tablas de entidades, arma la lista de líneas deseadas para ese periodo y la
reconcilia contra lo que ya hay con `diffDerived`
(`financial-base/engine/derived-budget.ts:51`). El diff **inserta, actualiza y borra**:

- inserta la línea que falta,
- **actualiza** la que cambió de monto, nombre, moneda, categoría o tipo,
- **borra** la línea cuya entidad dejó de existir o dejó de aportar.

Tiene tres llamadores:

| Llamador                           | Periodo que pasa               | Nota                                        |
| ---------------------------------- | ------------------------------ | ------------------------------------------- |
| `services/base-view.ts:99`         | el periodo **visitado**        | con guard: solo si no es anterior al actual |
| `services/rental-service.ts:107`   | el mes del **pago** registrado | puede ser pasado, a propósito               |
| `services/dividend-service.ts:163` | el mes del **pago** registrado | puede ser pasado, a propósito               |

El guard es el de **PR #819** (`638c0e32`, «fix(budget): no crear presupuesto derivado
retroactivo al visitar meses pasados»):

```ts
if (!esPeriodoAnterior(period, actual)) await syncDerivedBudget(period);
```

Su mensaje deja escrita la causa raíz, y conviene citarla porque es el eje de toda la
decisión que sigue:

> una LECTURA escribía. `loadBaseView` llamaba a `syncDerivedBudget` con el periodo
> visitado, así que abrir un mes pasado creaba sus líneas derivadas **con los montos de
> hoy** — un presupuesto que nunca existió.

El guard se puso en el **llamador de lectura** y no dentro de `syncDerivedBudget` justamente
porque los servicios de renta y dividendos necesitan el `id` de la línea materializada para
su `income_source_id`: si la función se negara a escribir en el pasado, esos dos caminos se
quedarían sin la línea que van a referenciar.

### Consecuencia visible

`/gastos` y Mi Base Financiera muestran, para un mes cerrado, un presupuesto **menor** que
el del mes en curso, aunque los compromisos no hayan cambiado. En la demo, antes de
resembrarla:

| Periodo                |     manual |     debt |     goal |          total |
| ---------------------- | ---------: | -------: | -------: | -------------: |
| 2025-09 … 2025-12      | ₡1.164.417 |        — |        — |     ₡1.164.417 |
| 2026-01                |   ₡971.417 |        — |        — |       ₡971.417 |
| 2026-02 … 2026-08      |   ₡755.417 |        — |        — |       ₡755.417 |
| **2026-09** (en curso) |   ₡755.417 | ₡620.680 | ₡350.000 | **₡1.726.097** |

El salto de ₡755.417 a ₡1.726.097 entre agosto y setiembre no describe ningún cambio en la
vida del usuario. Es el guard.

---

## 2. Opción A — materializar al cierre de mes

Al cerrar el mes, escribir sus líneas derivadas **con los compromisos vigentes en ese
momento**, y no volver a tocarlas nunca.

### Dónde iría

Ya existe el proceso: `/api/base/snapshot`, cron `0 6 1 * *`, recorre **todos** los
usuarios con el cliente de servicio y calcula el mes recién cerrado
(`previousMonthPeriod(...)`). No hay que crear cron, ni secreto, ni calendario. Se compone
ahí, igual que ya se compone el snapshot de patrimonio.

La variante de «primer ingreso del mes nuevo» es más barata en apariencia —hay sesión, así
que `syncDerivedBudget` sirve tal cual— pero deja huecos: el usuario que no entra durante
tres meses se queda sin tres meses de presupuesto, y rellenarlos después con los
compromisos de hoy **es exactamente el bug de #819**. Si se elige ese disparador hay que
limitarlo al mes inmediatamente anterior y solo cuando conste que el usuario estuvo activo
en él; conviene verificar antes si existe esa señal (`last_seen` o equivalente) porque de
eso depende que el disparador sea viable.

### Lo que hay que construir

1. **Una variante sin sesión de `syncDerivedBudget`.** Hoy arranca con `requireUser()` y
   `createSupabaseServerClient()` (cookies). El cron no tiene sesión. Todas las consultas
   ya filtran por `user.id`, así que parametrizar el id e inyectar el cliente es mecánico,
   pero toca las siete consultas y las dos de dividendos. Es el grueso del trabajo.
2. **Semántica de congelado.** Un periodo cerrado no puede seguir reconciliándose: si
   `diffDerived` sigue actualizando y borrando, saldar una deuda **borra** la línea que
   demuestra que se había presupuestado, y bajar una cuota reescribe el pasado. Hace falta
   un modo `congelado` que solo devuelva `toInsert` y nunca `toUpdate`/`toDeleteIds`, y que
   además solo inserte si el periodo no tiene ninguna línea derivada todavía. Es un branch
   en una función pura: barato de escribir y de probar en rojo primero.
3. **Salida para renta y dividendos.** Con el congelado, las llamadas de
   `rental-service.ts:107` y `dividend-service.ts:163` con un mes pasado dejarían de
   producir la línea que necesitan para `income_source_id`. Hay que darles un camino
   dirigido —«asegurá **esta** línea de **esta** entidad»— en lugar de un sync completo.
4. **La hora del cron.** Corre a las 06:00 UTC del día 1 y ancla el mes cerrado en UTC, a
   propósito, porque es un job de sistema. Para un snapshot eso es tolerable. Para un
   presupuesto que se **congela** no: en UTC−7 y más al oeste el usuario todavía está en el
   último día del mes cuando el job lo declara cerrado, y seguiría gastando en un mes ya
   congelado. Se resuelve corriendo más tarde (12:00 UTC) o anclando el periodo en la zona
   del usuario, que ya se sabe leer (`lib/time/user-time`).

### Riesgo

- Bajo sobre lo existente: **aditivo**. Los meses que hoy no tienen líneas siguen igual
  hasta que el cron las escriba; nada de lo que hoy se ve cambia de valor.
- El riesgo real está en el punto 2: si el congelado no se implementa bien, el cron termina
  reescribiendo historia en vez de fijarla, que es peor que no tener historia. Es la parte
  que exige tests antes que código.
- Almacenamiento: ~5 filas por usuario por mes. Irrelevante.

### Efecto sobre la historia

La historia pasa a ser un **registro**. «Presupuesto de julio» significa lo que el usuario
tenía comprometido en julio, y no cambia nunca más. El gráfico «gasto vs presupuesto» dice
algo verdadero, la diferencia y el % de ejecución de un mes cerrado son estables, y
coinciden con `monthly_snapshots`, con un CSV exportado y con lo que el asesor recuerda.

### Meses ya cerrados sin partidas

**A no los arregla.** Junio, julio y agosto de un usuario real se quedan con solo `manual`
para siempre. La historia empieza el mes en que la función entre en producción, con un
escalón visible en el borde.

Rellenarlos a posteriori solo se puede hacer con los compromisos de hoy, que es
precisamente lo que #819 declaró falso. Hay dos salidas honestas, y ninguna indolora:

- aceptar el borde y que el gráfico no dibuje marca de presupuesto antes de esa fecha, o
- rellenar a sabiendas de que es una aproximación, y **marcarlo** en la UI y en la fila de
  la base (por ejemplo un `source_kind` propio o una bandera), para que nadie lo confunda
  con un dato observado.

Nota sobre la demo: la resiembra de `scripts/demo/resembrar-derivadas.mjs` es un caso
particular en el que clonar sí es correcto, porque las tres deudas y las dos metas de esa
cuenta arrancan el 2025-09-01 y no cambian de cuota en toda la ventana. Eso **no**
generaliza a una cuenta real, y por eso el script vive en `scripts/demo/`.

---

## 3. Opción B — calcular al leer con los compromisos actuales

No escribir nada. Al leer un mes cerrado, sumarle al presupuesto `manual` el valor de los
compromisos vigentes **hoy**.

### Dónde iría

Ya está medio hecho, y eso es lo que la hace tentadora.
`expense-jars-service.getEntityFallbackBudgetPorPeriodo(periods, currency)` hace exactamente
esto para `holding` y `rental`: lee el catálogo de entidades y los tipos de cambio **una
vez** para todo el rango, y por mes solo consulta lo que depende del mes. Extenderlo a
`debt`, `goal`, `policy` y `recurring` completa B para todo el presupuesto: un servicio y
una función pura.

### Esfuerzo

El más bajo de los dos, con diferencia. Sin cambio de esquema, sin cron, sin variante de
servicio, sin semántica de congelado, sin migración de datos, sin backfill. La ruta de
lectura ya tiene la forma.

### Riesgo

- **La historia deja de ser un registro y pasa a ser una proyección.** Cada mes cerrado
  muestra los compromisos de hoy. Saldá una deuda esta tarde y junio, julio y agosto
  pierden ₡312.180 de presupuesto cada uno, retroactivamente. La diferencia contra el
  presupuesto y el % de ejecución de un mes cerrado cambian solos.
- Dos personas que miran la misma pantalla con un mes de diferencia ven **historias
  distintas**, sin que nada haya pasado.
- Rompe en silencio toda comparación contra algo que sí está persistido:
  `monthly_snapshots`, un CSV exportado, una captura que el usuario guardó, y
  `consultar_historial` del asesor. Dos fuentes para el mismo número y solo una se mueve.
- Es, literalmente, lo que #819 llamó «un presupuesto que nunca existió», legitimado en la
  capa de lectura en vez de persistido. El bug era que se escribía; el problema de fondo era
  que el número era falso.

### Efecto sobre la historia

No hay historia. Hay una foto del presente repetida hacia atrás.

### Meses ya cerrados sin partidas

**B los «arregla» de inmediato y de forma uniforme**, sin backfill y sin borde. Esta es su
única ventaja real, y es una ventaja grande: la pantalla queda coherente el día uno, para
todos los usuarios, incluidos los que ya tienen un año de uso.

### Si se elige B

Hay que decirlo en la pantalla. La marca de presupuesto de un mes cerrado no puede
presentarse como «lo que planificaste» sino como «tus compromisos actuales», y el tooltip
tiene que declararlo. Cualquier cosa menos que eso es una mentira por omisión, y además
genera el reporte de bug inevitable: «¿por qué cambió el presupuesto de julio?».

---

## 4. Comparación

|                                         | **A · materializar al cierre**                                                    | **B · calcular al leer**                                      |
| --------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Esfuerzo                                | Alto: variante sin sesión, congelado, salida para renta/dividendos, hora del cron | Bajo: extender un helper que ya existe                        |
| Cambio de esquema                       | Ninguno (índice único ya está)                                                    | Ninguno                                                       |
| Escrituras nuevas                       | ~5 filas/usuario/mes, una sola vez                                                | Ninguna                                                       |
| La historia es…                         | un registro, inmutable                                                            | una proyección del presente                                   |
| ¿El pasado cambia solo?                 | No                                                                                | **Sí**, cada vez que cambia un compromiso                     |
| Coherencia con snapshots / CSV / asesor | Sí                                                                                | No                                                            |
| Meses ya cerrados sin partidas          | Se quedan vacíos (borde visible)                                                  | Se llenan de inmediato                                        |
| Riesgo si se implementa mal             | Reescribe historia (peor que no tenerla)                                          | Ninguno técnico; el riesgo es que el número sea falso siempre |
| Reversible                              | Sí (borrar filas derivadas del pasado)                                            | Sí (quitar el fallback)                                       |

---

## 5. Recomendación

**A hacia adelante, B etiquetado hacia atrás**, con una regla de precedencia: cuando existe
la línea persistida, gana siempre.

El valor de un gráfico «gasto contra presupuesto» está en que el presupuesto **no se pueda
mover**: es una promesa que el usuario hizo en un momento. B entrega la pantalla completa
mañana, pero entrega un número que se mueve, y el día que un usuario note que julio cambió,
la confianza en el resto de la pantalla se va con él.

La combinación cuesta A + B en esfuerzo, y es el único camino en que la historia se vuelve
real sin inventar un pasado:

1. B ahora, **visualmente distinguible** (marca punteada, tooltip que diga «compromisos
   actuales»), para los meses anteriores a la fecha de despliegue.
2. A desde el despliegue: el cron congela cada mes al cerrarlo.
3. La línea persistida gana sobre el cálculo. Mes a mes, los meses proyectados se van
   convirtiendo en meses registrados, y al año no queda ninguno.

Si hay que elegir **una sola**, es **A**, aceptando el borde: es preferible una pantalla que
no dibuja marca de presupuesto en los meses viejos a una que dibuja una que miente.

---

## 6. Qué NO se hizo

- No se escribió sobre ningún usuario real. La única escritura fue la resiembra de la
  cuenta de demo, contra la base **local**, con `DEMO_ENV_FILE` explícito.
- No se cambió el esquema.
- No se tocó el guard de #819 ni ninguno de los tres llamadores de `syncDerivedBudget`.
