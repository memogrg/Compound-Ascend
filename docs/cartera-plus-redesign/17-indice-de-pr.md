# 17 · Índice de PR de los planes 15 y 16

Una línea por PR: qué hace, qué toca, riesgo. El detalle está en
[15 · Cierre de mes](15-cierre-de-mes.md) y [16 · Snapshots de patrimonio](16-snapshots-patrimonio.md).

## Plan 15 · Cierre de mes

| PR          | Qué hace                                                                                                                                               | Qué toca                                                                                                             | Riesgo                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **15-1** ✅ | `diffDerived` aprende a CONGELAR: con `congelado`, solo inserta —nunca actualiza ni borra— y no inserta nada si el periodo ya tiene derivadas          | `engine/derived-budget.ts` + su test                                                                                 | **Ninguno.** Nadie pasa `congelado` todavía; sin el flag el comportamiento no cambia                                                                                                   |
| **15-2**    | `syncDerivedBudget` deja de depender de la sesión: `AuthContext` como en `holdings-service`, en vez de `requireUser()` + cookies                       | `services/derived-budget-service.ts` (7 consultas de entidades + 2 de dividendos)                                    | **Medio.** Es el que más líneas toca; mitiga que no cambia ninguna decisión, solo de dónde salen el cliente y el id                                                                    |
| **15-3**    | El cron materializa el mes cerrado y lo congela; periodo anclado en la zona del usuario; cron a las 12:00 UTC; camino dirigido para renta y dividendos | `api/base/snapshot/route.ts`, `derived-budget-service.ts`, `rental-service.ts`, `dividend-service.ts`, `vercel.json` | **Alto:** escribe para todos los usuarios. Mitiga entrar con la escritura tras una bandera, mirar una corrida en seco («habría escrito N líneas para M usuarios») y encenderla después |
| **15-4**    | Estimado al leer para los meses cerrados sin partidas, con los compromisos VIGENTES EN ESE MES, rotulado «estimado» en gráfico, tabla y KPI            | `expense-jars-service.ts`, `presupuesto-por-mes.ts`, `historico-gasto.tsx`, `sections.tsx`                           | **Bajo** y reversible quitando el fallback                                                                                                                                             |

Orden: `15-1 → 15-2 → 15-3 (bandera apagada) → observar una corrida → bandera encendida → 15-4`.
15-4 va al final porque mientras el cron no haya corrido nunca, **todos** los meses cerrados
serían estimados y la pantalla se llenaría de rótulos.

Ninguno necesita migración.

## Plan 16 · Snapshots de patrimonio

| PR          | Qué hace                                                                                                                                                                                | Qué toca                                                                                        | Riesgo                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **16-A** ✅ | Toda escritura de `portfolio_snapshots` lleva `household_id` y `created_by`; el tipo generado los declara; backfill de las 4 filas de producción, leídas primero y actualizadas por ids | `services/snapshot-service.ts`, `database.types.ts`, `scripts/backfill-snapshots-household.mjs` | **Bajo.** Aditivo; sin migración, porque las columnas existen desde `20260601000011`                                                                                                                                         |
| **16-B**    | El `catch` mudo de la escritura deja de serlo: `logger.warn` con el `userId`                                                                                                            | `services/snapshot-service.ts`                                                                  | **Ninguno**                                                                                                                                                                                                                  |
| **16-C**    | La escritura sale de la carga de pantalla y pasa a un barrido diario en cron, para todos los usuarios                                                                                   | `snapshot-service.ts`, ruta de cron nueva, `vercel.json`                                        | **Medio.** Un usuario nunca barrido pierde el punto de hoy: la curva del día en curso pasa a dibujarse con el último punto cerrado                                                                                           |
| **16-D**    | `/patrimonio` y `/m/patrimonio` grafican el patrimonio NETO desde `getNetWorthHistory()`, no el valor de las inversiones                                                                | `patrimonio/page.tsx`, `m/(app)/patrimonio/page.tsx`, `portfolio-view.tsx`                      | **Medio:** cambia lo que el usuario ve. Con capturas antes y después, y **sin** copiar el fallback a `portfolio_snapshots` que usa el asesor: en una pantalla, mezclar dos series no comparables es peor que un estado vacío |

16-A y 16-B son independientes de 16-C y 16-D. 16-C es el que quita el ruido de las capturas
—hoy `/patrimonio` cambia de forma entre dos visitas seguidas, sin que el usuario haga nada—.
16-D va último.

## Lo ya hecho

- **15-1** y **16-A**, en esta ronda.
