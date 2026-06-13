# Revisión de producción · 06 — Cobertura, tests y CI

> Rama `chore/fase-6-tests-ci` · 2026-06-12 · `@vitest/coverage-v8@2.1.9` instalado.

## Cobertura inicial (antes de reforzar)

Global: 8.15% líneas — número esperado y poco informativo: incluye todos los
componentes/páginas (territorio del e2e, no del unit). Lo accionable son los
**engines puros** y libs:

| Área | Líneas antes | Después |
|---|---|---|
| `wealth/engine/portfolio-engine.ts` | **0%** | **100%** (98.8% branches) |
| `wealth/schemas.ts` | 0% | cubierto (casos válidos + inválidos) |
| `financial-base/schemas.ts` | 0% | cubierto (txn/budget/category) |
| `control/engine` | 82% | 82% (ya sano) |
| `rich-life/engine` | 90% | 90% |
| `financial-base/engine` | 79% | 79% |
| `lib/rate-limit` | 83% | 83% |

Refuerzo: **+75 tests** (43 en `portfolio-engine.test.ts` con números
verificados a mano; 32 en `schemas.test.ts` con paths de error exactos).
Suite total: **243 tests**.

Pendiente de refuerzo (anotado, no urgente): `ai/context-engine.ts` (0%, ata
servicios con sesión — necesita mocks pesados; candidato a F7 o post-revisión),
ramas de `priority-engine` (73.8%).

## E2E smoke (Playwright)

`tests/e2e/smoke.spec.ts`: login → dashboard con datos → crear gasto desde los
frascos (modal Registrar gasto) → patrimonio renderiza el portafolio.
**Verde en 1.1 min** contra `npm run dev` + usuario sintético del sandbox.

### Hallazgos del e2e (valiosos por sí mismos)
1. **El watcher de Next dev mata server actions en vuelo**: si algo escribe
   dentro del árbol del proyecto durante una acción (Playwright escribía
   traces en `test-results/`), el dev server recompila y la acción muere — el
   login queda en "Un momento…" para siempre. Fix: `outputDir` de Playwright
   fuera del proyecto (`/tmp`). Solo afecta a dev, no a producción.
2. **El primer submit del login puede perderse en dev** (acción recompilada en
   vuelo) — el spec lo cubre con reintento. En producción no aplica (sin
   recompilación), pero si algún usuario lo reporta, esta es la pista.

## CI propuesto (pendiente de aprobación del owner — no commiteado)

Cambios al `ci.yml`: añadir **build** como paso (hoy CI no construye — el gap
señalado en el plan), cache de `.next/cache`, y un job de **e2e** que levanta
Supabase local (CLI) + seed del usuario de prueba + dev server. El YAML
completo está en la descripción del PR de esta fase.

## Branch protection propuesta (solo propuesta)

Para `main`: requerir PR (sin push directo), requerir el check `CI` verde,
dismiss de approvals al hacer push nuevo, y prohibir force-push. Se configura
en GitHub → Settings → Branches (lo hace el owner).
