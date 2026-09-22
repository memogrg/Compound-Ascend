# CARTERA+ · Rediseño UX — Progreso

| Fecha | Hito | Estado | Evidencia |
| --- | --- | --- | --- |
| 2026-09-16 | Auditoría del repo (rutas, nav, gráficos, design system, filtros) | Hecho | Blueprint §1-3, §17 |
| 2026-09-16 | Investigación competitiva (22 productos, ~50 páginas) | Hecho | Blueprint §19 |
| 2026-09-16 | Investigación de librerías de gráficos (17 librerías, matriz ponderada) | Hecho | Blueprint §12-14 |
| 2026-09-16 | Auditoría de herramientas / skills / MCP | Hecho | Blueprint §18 |
| 2026-09-16 | Blueprint maestro (29 secciones) | Entregado, pendiente de aprobación | Claude Doc |
| 2026-09-16 | Capturas del estado actual con la cuenta demo (18 pantallas, 868 px) + 5 hallazgos nuevos | Hecho | estado-actual/ · 13-estado-actual-capturas.md |
| 2026-09-16 | Aprobación de decisiones 1-6, 11, 12 («sí a todo») | Hecho | 10-decisions.md |
| 2026-09-16 | Secreto: entradas con JWT quitadas de .claude/settings.local.json; .gitignore actualizado; rotación de clave a cargo de Memo | En curso | .gitignore |
| 2026-09-16 | Shell A/B/C (Artifact) | Entregado, pendiente de elección | https://claude.ai/artifact/A4nqpvEJTH5co3sGUgWaH8 · prototipos/01-shell.html |
| 2026-09-16 | /dev/ui — 8 primitivas y lenguaje de gráficos (Artifact) | Entregado, pendiente de aprobación | https://claude.ai/artifact/NuWuoNDAnW3gvfQw6zrfFV · prototipos/02-dev-ui.html |
| 2026-09-16 | Hoy A/B/C (Artifact) | Entregado, pendiente de elección | https://claude.ai/artifact/Mbhw3WTFdXFqWNiSYYt8Gk · prototipos/03-hoy.html |
| 2026-09-16 | Paleta de gráfico validada (daltonismo, contraste) claro y oscuro | Hecho | prototipos/tokens.css (`--chart-1..6`) |
| 2026-09-16 | Decisiones 15-17 aprobadas (shell B+, /dev/ui, Hoy B+) | Hecho | 10-decisions.md |
| 2026-09-16 | Prompts delta de la fase 0 (0.1-0.6) redactados | Entregados | prompts/ |

## Fase 0 · Fundamentos — cerrada

| Prompt | Rama | PR | Qué entregó |
| --- | --- | --- | --- |
| 0.1 | `chore/redesign-secrets-docs` | [#800](https://github.com/memogrg/Compound-Ascend/pull/800) | `.gitignore` de la config local de Claude Code; `docs/cartera-plus-redesign/` versionada |
| 0.2 | `fix/dashboard-deuda-saldo-vivo` | [#801](https://github.com/memogrg/Compound-Ascend/pull/801) | La campana y el hub leen el saldo VIVO de deuda, no el ancla |
| 0.3 | `chore/qa-snapshots` · `chore/qa-determinismo` · `chore/qa-criterio-ruido` | [#802](https://github.com/memogrg/Compound-Ascend/pull/802) · [#803](https://github.com/memogrg/Compound-Ascend/pull/803) · [#804](https://github.com/memogrg/Compound-Ascend/pull/804) | Captura y diff de píxeles; determinismo (9 → 0 diferencias); criterio de dos condiciones |
| 0.4 | `refactor/css-layers` | [#807](https://github.com/memogrg/Compound-Ascend/pull/807) | `globals.css` (7.614 líneas) partido en 19 archivos y en la capa `ca`, con bundle idéntico |
| 0.5 | `feat/design-tokens-v2` | [#808](https://github.com/memogrg/Compound-Ascend/pull/808) | `--chart-1..6` y motion; `formatDelta`/`formatPct1`/fechas cortas; galería `/dev/ui` |
| — | `chore/qa-reloj-servidor` | [#810](https://github.com/memogrg/Compound-Ascend/pull/810) | Reloj del SERVIDOR congelado y red externa bloqueada: la base pasa a ser válida entre días |
| 0.6 | `chore/nuqs-axe` | este PR | `nuqs` + parsers de URL puros; auditoría axe y línea base de a11y; cierre documental |

### Hallazgos abiertos

Todos anotados en [`11-open-questions.md`](./11-open-questions.md), con archivo y línea:
desborde horizontal a 390 px en `/ingresos` y `/control-financiero`; alias de tema que no
voltean en un contenedor; ausencia de tokens tipográficos; divisor de «/día prom.» con
`getDate()` sobre fecha UTC; drift de versión de npm en el lockfile; `eslint.config.mjs` con
reglas de `react-hooks` sin `files`; y la dependencia de la línea base respecto de
`market_price_cache` local.

La línea base de accesibilidad está en [`qa/a11y-baseline.md`](./qa/a11y-baseline.md): 392
nodos, 2 `critical` y 390 `serious`, concentrados en 5 reglas.

### Siguiente

1. `fix(a11y)`: `select-name` (los 2 `critical`, una ruta) y `aria-prohibited-attr` en
   `.brand-mark` (38 nodos en 19 rutas — un solo componente).
2. `fix/` del divisor de «/día prom.», con test bajo `TZ=America/Costa_Rica`.
3. Pilotos de rediseño: **Hoy** y **Gastos**.

Fase 1 · delta 1 nav-model: hecho (#815).
Fase 1 · delta 2 sidebar-v2: hecho (#816).
Fase 1 · delta 3 topbar-period: hecho (#817).
Fase 1 · delta 4 tabs-url: hecho (#818).
fix(budget) presupuesto derivado retroactivo: hecho (#819) — base visual regenerada desde `e4cace8b`.
Fase 1 · delta 5 command-palette: en revisión — paleta ⌘K sobre `modal.tsx`, sin dependencias nuevas.
