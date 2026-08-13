# Simulador (gemelo digital) — arnés F1c

Rebanada vertical del simulador: crea un **usuario sintético** contra un Supabase
de **PRUEBAS**, lo siembra con una persona, dispara unos pocos **eventos reales**
(las funciones de la app, sin atajos) sobre un **reloj virtual**, y valida los
**invariantes núcleo** con las **lecturas ctx-aware de la propia app**. Nunca
producción.

## Cómo correrlo

Necesita un Supabase de PRUEBAS con las migraciones aplicadas (p. ej. Supabase
local en `http://127.0.0.1:54321`) y estas variables en el entorno (las mismas de
`tests/rls`):

```bash
export SUPABASE_TEST_URL=http://127.0.0.1:54321
export SUPABASE_TEST_ANON_KEY=...
export SUPABASE_TEST_SERVICE_ROLE_KEY=...
npm run sim
```

Sin esas tres variables el runner **se salta** (igual que `tests/rls`), así que
`npm test` y la batería normal siguen verdes. El runner **no** lo agarra
`npm test`: su `include` es sólo `sim/**` (ver `sim/vitest.config.ts`).

## Qué hace (y qué garantiza)

1. **Arnés de BD** (`harness.ts`): `createUser` (admin service-role) →
   `signInWithPassword` (ese cliente autenticado ES `AuthContext.db`) →
   `ensure_household` (el trigger de signup NO crea el household) → fija moneda
   única + `timezone` UTC. Reset = `deleteUser` en cascada, email único por corrida.
2. **Persona** `control-excelente` (`personas/`): identidad + base financiera
   mínima, todo derivado de la semilla vía un PRNG determinista (`prng.ts`).
3. **Eventos** (`app-driver.ts`) bajo `withSimClock` desde el día 0 virtual:
   `receivePartialIncome`, `createTransaction` (gasto), `addDebtPayment`,
   `addGoalContribution`, `spendFromGoal`.
4. **Invariantes** (`validators.ts`) tras cada evento y al cierre:
   - **Liquidez**: `saldo == apertura + ingreso − gasto − pago − aporte`.
   - **Sin doble conteo**: el consumo de frasco no mueve la liquidez.
   - **Flujo del mes**: `flujo operativo = ingresos − gastos` (el aporte a meta es
     capital, el consumo de frasco es excluido).
   - **Progreso de meta**: `acumulado = aportes − consumos`.
   - **Patrimonio**: `neto = activos − pasivos` y `neto = liquidez + metas +
     inversiones − deudas`.
   - **Integridad de vinculadas**: cada evento vinculado tiene su transacción + su
     fila especializada; sin huérfanas.
5. **Log estructurado** (`event-log.ts`): journal de fases/eventos/checks, impreso
   siempre al final.

Un **"fallo"** = un invariante violado **o** una excepción de una función real.
Determinismo: toda la corrida sale de una sola semilla.

> Regla de oro: **SIEMPRE `SUPABASE_TEST_*`, NUNCA producción.** Además, `setup.ts`
> apunta el env plano de Supabase al proyecto de PRUEBAS, de modo que ni una
> creación accidental de cliente sin `ctx` pueda alcanzar producción.

## Librería de personas + motor conductual (F2 · `sim/library/`)

Generaliza de 1 persona guionada a una **librería diversa** conducida por un
**motor conductual**, corriendo cada persona por una ventana de mes (día a día).
La rebanada vertical de F1c (`vertical-slice.test.ts`) queda intacta.

- **`persona-types.ts`**: `PersonaSpec` = identidad/demografía + setup financiero +
  5 **rasgos** conductuales 0–1 (impulsividad de gasto, tendencia a ahorrar,
  aversión al riesgo, cumplimiento de presupuesto, sensibilidad a emergencias).
- **`personas/`** (split 3+4 · esta entrega trae 3): `control-excelente`,
  `sobreendeudado`, `ingreso-muy-bajo`. Rasgos fijos por arquetipo, montos
  derivados de la semilla. (Faltan 4 en un follow-up.)
- **`behavior-engine.ts`** `decideDayEvents(persona, state, mes, día, rng)`:
  traduce rasgos + estado en **eventos reales** (ingreso en día de pago, gastos
  fijos + discrecionales, aporte/consumo/retiro de meta, pago de deuda mínimo vs
  extra, compra de inversión **no cotizada**, emergencia compuesta = gasto grande
  + retiro de ahorro, hito vital = multiplicador de ingreso). Determinista por
  semilla; los holdings son no cotizados (el cotizado + DCA es F3).
- **`runner.ts`** `runPersona`/`runLibrary` — parametrizado por **`months`**
  (default 1). Las **expectativas se acumulan del stream real de eventos**, así los
  invariantes de F1c (reusados) siguen exactos; agrega adherencia de presupuesto e
  integridad de vinculadas **dinámica** (conteos del mes). Al **cierre de mes**
  refresca y **loguea los insights** de la persona (info, sin validar coherencia
  todavía).
- **Correr**: `npm run sim` corre TODAS (F1c + librería). `SIM_ONLY=<key>` una sola;
  `SIM_MONTHS=<n>` amplía la ventana.
