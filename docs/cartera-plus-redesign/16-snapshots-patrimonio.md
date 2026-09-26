# 16 · Snapshots de patrimonio: sacar la escritura de la carga, y graficar el patrimonio neto

**Plan. No implementado todavía.**

Cuatro cosas, y las cuatro salieron de medir, no de leer código:

1. la escritura de `portfolio_snapshots` sale de la carga de pantalla y pasa a un barrido diario;
2. `household_id` y `created_by` en toda escritura, más el backfill de las filas de producción
   que no los tienen;
3. `/patrimonio` y `/m/patrimonio` grafican el **patrimonio neto** desde `getNetWorthHistory()`;
4. por qué los valores salen en 0 en QA local — que resultó no ser lo que parecía.

---

## 1 · La escritura sale de la carga de pantalla

### Lo que pasa hoy

`snapshot-service.ts` escribe una fila de `portfolio_snapshots` al cargar el portafolio, dentro
de un `try/catch` mudo:

```ts
await supabase.from("portfolio_snapshots").insert({ user_id: userId, date: today, ... });
} catch {
  // Silencioso: no bloquear la carga del portafolio por un fallo de snapshot.
}
```

Una LECTURA que escribe, otra vez — la misma familia que el bug que arregló el PR #819, aunque
aquí el monto no sea retroactivo.

### Cómo se detectó, y por qué importa

Capturando las 200 pantallas **dos veces contra el mismo build y el mismo servidor**, nueve
comparaciones difieren: `/patrimonio` y `/m/patrimonio` en todos sus anchos y temas, entre 800 y
5.000 píxeles. Recortando la zona que cambia (142×65 px en (379,716) de
`light/1280/patrimonio.png`), el escalón de la curva está en una **x distinta**: la serie tiene
un punto más en la segunda corrida. La primera visita lo creó.

O sea: **el gráfico de patrimonio cambia de forma entre dos visitas seguidas, sin que el usuario
haga nada.** Para el usuario es ruido; para QA es un diff que hay que descartar a mano en cada
corrida, que es exactamente lo que hace que los diffs visuales dejen de mirarse.

### Qué se hace

- El `insert` sale de `generateAndSaveSnapshot` en el camino con sesión. La pantalla solo lee.
- Un **barrido diario** en cron, con el cliente de servicio, recorriendo a todos los usuarios —
  el mismo patrón que `generateSnapshotsForAllUsers` y `generateNetWorthSnapshotsForAllUsers`,
  que ya existen. El camino sin sesión de `snapshot-service` (a partir de la línea ~160) ya está
  escrito para esto: normaliza monedas, resuelve precios desde `market_price_cache` y llama a
  `generateAndSaveSnapshot`. Lo que falta es la ruta que lo dispare para todos.
- El `catch` mudo se convierte en un `logger.warn` con el `userId`: en un cron, un fallo
  silencioso es un agujero que nadie ve. (El camino de cron ya lo hace; el de pantalla no.)

**Efecto secundario que hay que decir:** con esto, un usuario que nunca haya sido barrido no
tiene punto de hoy. Es lo correcto —el snapshot es del cierre del día, no del momento en que
alguien abrió una pantalla— pero cambia la curva del día en curso, que pasa a dibujarse con el
último punto cerrado.

---

## 2 · `household_id` y `created_by` en toda escritura

### El dato

Medido en producción (solo conteos, sin leer filas):

```
portfolio_snapshots · total: 16 · sin household_id: 4 · sin created_by: 4
```

Las columnas existen —la migración `20260601000011_investment_engine.sql` crea hasta el índice
`idx_portfolio_snapshots_household`— pero el `insert` de `snapshot-service.ts` no las pone.

### Por qué importa

Es la regla dura del repo: **todo INSERT en tablas de datos de usuario lleva `household_id`**,
porque la RLS filtra por él. Una fila sin `household_id` es invisible para el resto del hogar:
Marta no vería los cuatro puntos de patrimonio que sí ve José. Hay hasta un test que vigila la
propagación (`tests/unit/household-propagation.test.ts`), y esta escritura se le escapó porque
no pasa por el pipeline central.

### Qué se hace

- El `insert` lleva `household_id` (de `getActiveHouseholdId()` en el camino con sesión, y del
  hogar del usuario en el de cron) y `created_by`.
- **Backfill de las 4 filas**, en una migración que las rellena desde el `user_id` de cada fila.
  Va DESPUÉS del PR que arregla el `insert`: si se rellena primero, el código sigue creando
  filas nuevas sin los campos y el backfill se queda corto en cuanto alguien abre la pantalla.
- El test de propagación se extiende a esta tabla, para que no vuelva a escaparse.

---

## 3 · Graficar el patrimonio NETO, no el valor del portafolio

### El problema

`/patrimonio` y `/m/patrimonio` grafican `portfolio_snapshots`, que es el valor de las
**inversiones**. La pantalla se llama Patrimonio y el usuario lee la curva como su patrimonio.
No es lo mismo: el patrimonio neto es líquido + inversiones + activos − deudas.

Ya hay una serie correcta: `net_worth_snapshots`, que escribe el cron mensual
(`/api/base/snapshot`) y lee `getNetWorthHistory()` (`rich-life/services/net-worth-snapshot-service.ts:245`).
Es la que usa el asesor en `consultar_historial`.

### Qué se hace

- Las dos pantallas leen `getNetWorthHistory()` para la curva de patrimonio.
- **El fallback de `history-query-service` NO se copia.** Ahí se cae a `portfolio_snapshots`
  mientras la serie de patrimonio tenga menos de 2 puntos, y está bien para el asesor, que
  prefiere decir algo a no decir nada. En una pantalla, mezclar dos series que no son
  comparables es peor que un estado vacío: si hay menos de 2 puntos, se dice «todavía no hay
  historial de patrimonio» y se muestra el valor de hoy.
- Si se quiere conservar la curva de inversiones, va como una **segunda serie con su propio
  rótulo**, nunca como la misma línea.
- `previousNetWorth` de `aggregateNetWorth` lee el último periodo **cerrado** (`lt` sobre el
  periodo actual) a propósito, o la propia fila del mes en curso pondría `wealthVelocity` en
  cero. Cualquier lectura nueva de la serie tiene que respetar ese corte.

---

## 4 · Por qué los valores salían en 0 en QA local

**No era el reloj congelado, ni `QA_BLOCK_EXTERNAL`, ni los tipos de cambio.** Era que **la base
local estaba 24 migraciones por detrás del código**.

La cadena, medida:

1. `/api/investments/portfolio` devolvía `{"holdings":[], "analytics":{"totalPortfolioValue":0,…}}`
   con dos holdings en la tabla.
2. `listHoldings` hace `.select(HOLDING_COLS)`, y `HOLDING_COLS` nombra 49 columnas.
3. Pidiéndolas a PostgREST a mano:

   ```
   status: 400
   {"code":"42703","message":"column investment_holdings.payout_enabled does not exist"}
   ```

   Faltaban 15: los siete `payout_*` y los ocho `note_*`.
4. El cliente de Supabase devuelve `{ data: null, error }`, y el servicio hace `(data ?? [])`.
   **Un error de consulta y «este usuario no tiene inversiones» son indistinguibles.**
5. Comparando `supabase_migrations.schema_migrations` con `supabase/migrations/`: 112 aplicadas
   contra 136 en el repo. Las columnas las añaden `20260907000002_notas_estructuradas.sql` y
   `20260907000003_renombra_payout.sql`.

Aplicadas las 24 a la base local, `/patrimonio` pasó de ₡0 a ₡2.935.180 sin tocar una línea de
código.

### Qué se hace con esto

- **Nada en el producto**: es deriva del entorno. Las migraciones se aplican a mano (es el
  proceso del repo) y la local se quedó atrás.
- **Sí hay algo que arreglar**: que un `select` fallido se lea como «sin datos». La forma barata
  es `logger.warn` con `error.code` en los servicios que hacen `(data ?? [])` sobre una consulta
  que no debería fallar nunca. Sin eso, la próxima vez que una columna falte en producción, la
  pantalla dirá «agregá inversiones» a alguien que tiene inversiones.
- **Y algo que comprobar**: el job `Migraciones aplican en BD fresca` prueba que las migraciones
  corren sobre una base vacía, no que la base de nadie esté al día. Un chequeo de arranque en
  desarrollo —comparar `schema_migrations` con los ficheros y avisar— habría ahorrado esta
  sesión entera.

---

## Orden

```
PR A · household_id + created_by en el insert, y el catch deja de ser mudo
PR B · migración de backfill de las 4 filas            (después de A, nunca antes)
PR C · barrido diario en cron; la pantalla deja de escribir
PR D · las dos pantallas grafican getNetWorthHistory()
```

A y B son independientes de C y D y se pueden mandar ya. C es el que quita el ruido de las
capturas. D es el que cambia lo que el usuario ve, y por eso va último y con capturas antes y
después.
