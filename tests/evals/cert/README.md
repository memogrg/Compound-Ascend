# Auditoría de IA (Fase 8)

Evalúa el **razonamiento observable** del asesor LLM real (Gemini) sobre personas
profundas del simulador, a dos puntos temporales (mes 1 vs mes 6), con un **scorer
híbrido**: chequeos deterministas (evidencia dura) + un juez graduado 0-5 para lo
subjetivo. Más un **carril determinista sin gate** (guardrails + detectores) que corre en
`npm test`.

## Correr

```bash
RUN_LIVE_EVALS=1 EVAL_JUDGE=1 npm run ai-audit
```

Gated en `RUN_LIVE_EVALS` + `GEMINI_API_KEY` + `SUPABASE_TEST_*` (se auto-omite sin ellos).
Escribe `tests/evals/cert/out/ai-audit-report.md` (gitignored). Tunable por costo:

- `AI_AUDIT_N` — corridas del juez a promediar (default 3).
- `AI_AUDIT_PERSONAS` — lista separada por coma (default: las 5 diversas).
- `EVAL_JUDGE_MODEL` — juez (default `gemini-3.1-pro-preview`); `EVAL_MODEL` — modelo bajo prueba.

Estimación por corrida completa (4 personas × ~2 puntos × set enfocado ≈ 32 outputs):
~32-64 llamadas al asesor + ~`outputs × N` al juez (≈ 96 con N=3) ≈ **130-160 llamadas Gemini**;
el juez `-pro` domina el tiempo. El carril determinista = **0** llamadas.

## Scorer híbrido

- **Objetivo → determinista (❌ concreto, sin juez):**
  - `grounding.ts`: parsea las cifras que cita el asesor y las verifica contra el contexto REAL.
  - `contradictions.ts`: invertir-en-déficit · pagar-deuda-saldada · felicitar-en-caída · meta-lujo-sin-cubrir.
- **Subjetivo → `rubric.ts` (juez 0-5 JSON, N corridas):** **9 dims** que encodean el charter
  "EXIGENTE Y CÁLIDO": `relevancia`, `personalizacion`, `prioridad`, `accionabilidad`,
  `consulta_apropiada`, `proactividad`, `confrontacion_calida`, `conciencia_temporal`,
  `explicacion_y_tono`. Las 4 CONDICIONALES (`accionabilidad`, `consulta_apropiada`,
  `proactividad`, `confrontacion_calida`) pueden devolver `"NA"` cuando el turno no las amerita
  y se **excluyen** del promedio (una pregunta aclaratoria bien puesta es 5 en `consulta_apropiada`
  y `"NA"` en `accionabilidad` — así no la castiga el composite). Al juez se le pasa el **contexto
  real (con ladder de deuda + brechas de fondo) + las banderas esperadas** por probe, para juzgar
  proactividad con base. Stats: media global (solo aplicables), peor-10, mejor-10, y `k/N` por dim.
  La suite `proactividad` (turnos abiertos con deuda cara / fondo vacío) mide el volunteo.

## Contexto reconstruido (caveat de fidelidad)

`buildFinancialContext` NO es ctx-aware (sesión por cookie), así que `context-builder.ts`
reconstruye el `FinancialContext` de la persona sembrada vía los servicios ctx-aware +
`computeTrajectory` sobre puntos capturados mes a mes + un insight recomputado.

- **Reales:** ingreso/gasto/flujo/tasa de ahorro, patrimonio, deudas, metas, portafolio, los
  3 números @8%, trayectoria, insight de ahorro bajo.
- **Descriptores de persona (constantes del harness):** nombre, topConcern, lifeStage.
- **Omitidos/aprox (caveat en el reporte):** indicadores macro y biblia RAG.

### Trajectory — reconciliación (crítico)

Producción arma la trayectoria de `monthly_snapshots` (getSnapshotHistory) +
`portfolio_snapshots` (getPortfolioHistory), pero el runner del sim solo escribe
`net_worth_snapshots` → la trayectoria saldría **vacía**. El harness lo reconcilia
**capturando `MonthlyPoint`/`PortfolioPoint` en cada cierre de mes** vía servicios
ctx-aware (`getMonthFlow`, `getRichLifeSummary`, `getPortfolioReport`) y llamando al motor
puro `computeTrajectory` — y hace un **spot-check** de que la trayectoria a mes 6 NO esté
vacía antes de puntuar la suite longitudinal (si sale vacía es artefacto del harness, no
fallo del asesor). Además reporta la **fuga de reloj** de `getPortfolioHistory` (ventana 6M
con `new Date()` real, `wealth/snapshot-service.ts:259`) como hallazgo de la app.

## Suites de probe

adversarial (contradicción) · longitudinal (mes1 vs mes6) · consistencia-tras-cambio (paga
la deuda a 0 → reconstruye contexto → detecta recomendación fantasma, regla #31) · genérico
(mismo prompt a 2 personas → deben diferir) · **proactividad** (turnos abiertos "¿cómo voy?"
sobre personas con deuda cara / fondo de emergencia vacío → mide si VOLUNTEA la alarma).

## Carriles

- **Gated (live):** `ai-audit.live.test.ts` — lo corre Memo. No hace hard-fail ante un
  hallazgo (audita primero: escribe el reporte completo con los ❌ para revisión).
- **Sin gate (floor, corre en `npm test`):** `ai-audit.det.test.ts` — grounding/contradicciones
  con fixtures + guardrails puros (`applyGuardrail`/`guardMovimientos`) + round-trip
  `ScriptedProvider`→`financeChat`. Sin BD, sin Gemini.

## Archivos

`types.ts` · `grounding.ts` · `contradictions.ts` (puros) · `rubric.ts` (juez+stats) ·
`context-builder.ts` · `personas.ts` · `prompts.ts` · `runner.ts` · `run.ts` · `report.ts` ·
`vitest.config.ts` · `ai-audit.{live,det}.test.ts`.
