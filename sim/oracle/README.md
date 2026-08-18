# Oracle financiero (Fase 4)

Oracle **independiente** que re-deriva cada métrica financiera desde las **filas crudas**
con matemática propia y la contrasta contra lo que producen los **servicios reales** de la
app, sobre escenarios deterministas del simulador. Corre local (Memo):

```bash
npm run oracle
```

Gated en `SUPABASE_TEST_*` (se auto-omite sin la BD de prueba). Escribe
`sim/oracle/out/oracle-report.md` (gitignored).

## Regla de independencia

`metrics.ts` **no importa NADA de `src/modules`** — cada número sale de las filas crudas
con fórmulas propias. Los servicios (`getMonthFlow`, `getPortfolioReport`, …) se llaman
**solo** para obtener el valor-app a contrastar. Single-currency CRC → `convertCurrency` es
identidad, el oracle opera 1:1 (multi-moneda fuera de alcance de estos escenarios).

Puntos de independencia deliberados:
- **Portafolio**: `quantity`/`invested` se reconstruyen desde el **inicial conocido del
  escenario** + el ledger crudo `holding_contributions` (`amount`/`unit_price`), **nunca**
  desde `average_cost` (eso reusaría el merge de la app).
- **Deuda**: replay de `debt_payments` por **días reales** (`apr/365·días`), no un mes por pago.
- **Meta**: `saved = Σ` transacciones linked `'goal'`, no `savings_goals.current_amount`.
- **Liquidez**: `Σ` deltas de `liquidity_ledger`. **Flujo**: `Σ` `transactions` crudas.

## Dos capas de veredicto

**BLOQUEANTE** (falla el build):
- **Sanidad**: cualquier valor `NaN` / `Infinity` / `undefined` en una métrica.
- **Identidades núcleo**: neto = activos − pasivos · composición = liquidez+metas+inversiones−deudas ·
  identidad del saco (liquidez-oracle = saldo reportado) · sin doble conteo (invested
  event-sourced = `cost_basis`).

**CARACTERIZACIÓN** (se reporta, no bloquea; se promueve en Fase 10): las 8 zonas frágiles.
Para cada una, el reporte muestra la **Δ real** junto a la **Δ-modelo esperada** para
distinguir "Δ = modelo conocido" de "Δ > modelo" (posible bug). Ante un ❌ CRÍTICO, el test
imprime el **reporte completo**, no solo el assert.

## Escenarios (parametrizables)

`SCENARIOS` en `scenarios.ts`; `runOracle({ scenarios: [...keys] })` filtra. Default = los 4:
`control-excelente` (flujo/ahorro z1/z2, meta z5), `sobreendeudado` (deuda apr>0, replay z3/z4),
`inversionista-dca` (portafolio event-sourced z8), `precio-ausente` (probe z6). Escala a las 8
personas y luego a la población de 300 agregando keys — sin reescribir.

## Zonas frágiles → check

| # | Zona | Check | Clase |
|---|---|---|---|
| 1 | Doble conteo tasa de ahorro | oracle (solo asignaciones) vs app (acredita sobrante); Δ-modelo = sobrante/ingreso | caracterización |
| 2 | 2 def. de freeCashflow | operativo (app) vs real incl. capital (oracle); Δ-modelo = capital | caracterización |
| 3 | Deuda 1-mes-por-pago | replay día-a-día vs mes-por-pago (2 pagos mismo mes) | caracterización |
| 4 | APR variable | APR fija en el escenario; check vivo, no ejercitado | caracterización |
| 5 | Meta absorbe huérfanas | Σ linked vs `current_amount` (el plug oculta derivas) | caracterización |
| 6 | priceUnavailable→PL=0 | app marca `priceUnavailable`; PL entra 0 al agregado sin señal | caracterización |
| 7 | negativos / base-cero | `remaining = budget−spent` finito; patrimonio 0-pasivos sin NaN/∞ (via finiteGuard) | bloqueante si fuga |
| 8 | #655 doble conteo | invested event-sourced = `cost_basis` (identidad) | **bloqueante** |

## Archivos

`types.ts` · `raw.ts` (lee filas vía ctx.db) · `metrics.ts` (**puro**, sin src/modules) ·
`tolerances.ts` · `compare.ts` (veredictos) · `report.ts` (tabla md) · `scenarios.ts`
(seeding determinista) · `run.ts` (orquesta) · `oracle.test.ts` (gated) ·
`oracle-math.test.ts` (ungated, fixtures del núcleo puro).
