# CARTERA+ · Rediseño UX — Preguntas y decisiones pendientes

_Extraído del blueprint maestro (16-sep-2026). Fuente viva: https://claude.ai/code/artifact/0e037de8-78ec-44fd-b4ef-3ea701eea331_

## 28. Questions / decisions required

Solo las decisiones que cambian lo que se construye. Cada una trae la recomendación para que aprobar sea decir «sí».

| # | Decisión | Opciones | Recomendación |
| --- | --- | --- | --- |
| 1 | Arquitectura de información | A viaje · B objetos planos · **C núcleos + pestañas** | C |
| 2 | Nombres de los cinco núcleos | Hoy / Flujo / Planes / Patrimonio / Asesor — o alternativas (Inicio, Movimiento, Metas, Riqueza, My Agent C+) | Los cinco propuestos; «Asesor» con el isotipo, sin escribir «My Agent C+» en el menú |
| 3 | Número principal del Home | **Libre para gastar** · Flujo del mes · Patrimonio neto | Libre para gastar (con la fórmula de la sección 10) |
| 4 | Hogar único de recomendaciones | **Hoy · Acciones** (los módulos solo enlazan) · mantener tarjetas por módulo | Hoy · Acciones |
| 5 | Tecnología de gráficos | **Híbrido Recharts + ECharts modular** · solo Recharts · migrar todo a ECharts · Highcharts con licencia | Híbrido |
| 6 | Dependencias nuevas | `echarts`, `@number-flow/react`, `nuqs` ahora; `cmdk`, TanStack Table/Virtual, `@axe-core/playwright` en su fase | Aprobar las seis; ninguna otra sin justificación escrita |
| 7 | Fondos de emergencia y paz | Quedan en Protección · **pasan a Planes · Fondos** | Planes |
| 8 | Rutas | Conservar hasta la fase 6 y consolidar con 301 · renombrar desde el inicio | Conservar hasta la fase 6 |
| 9 | Filtro por miembro del hogar | Global desde el piloto · **solo cuando el hogar tenga > 1 adulto, desde la fase 4** | Fase 4 |
| 10 | Libertad: fórmulas del engine (capital objetivo, tasa de retiro, rendimiento real) | Validar con Memo antes de diseñar | Sesión de 30 min con el engine abierto |
| 11 | Secreto en `.claude/settings.local.json` | Ignorar + rotar clave · solo ignorar | Ignorar y rotar |
| 12 | Rama `claude/agitated-wescoff-65711d` | Mergear antes del piloto · reimplementar el fix | Mergear |
| 13 | Quién ejecuta qué | Memo/Claude Code en el Mac para todos los deltas · David toma navegación en paralelo | David en fase 1, Claude Code en fase 2, ambos desde la 3 |
| 14 | Aprobación visual | Artifacts HTML con datos demo · Figma | Artifacts |

**Preguntas abiertas que no bloquean (se resuelven durante el diseño):** si el Sankey vale la pena en escritorio o basta con barras ordenadas; si la app móvil publicada acepta el cambio de barra inferior en la misma versión; si el modo Flex (fijo / no mensual / flexible) se ofrece alguna vez; si exportar PNG/CSV aporta valor real.



## 29. Next action

Para entrar a la fase de diseño basta con aprobar cuatro cosas de la sección 28: la arquitectura C (decisión 1-2), el número principal y el hogar de recomendaciones (3-4), la tecnología híbrida con sus seis dependencias (5-6), y las dos correcciones previas (11-12). Con eso, el primer ciclo produce tres Artifacts: **shell A/B/C**, **`/dev/ui`** con las primitivas y **Hoy A/B/C**, todos con los datos de la Familia Ramírez.

- [ ] Memo aprueba (o ajusta) las decisiones 1-6, 11 y 12 comentando en este documento.
- [ ] Elsa entrega el shell A/B/C y `/dev/ui` como Artifacts (escritorio + móvil, claro + oscuro).
- [ ] Memo elige o combina; la decisión se escribe en `docs/cartera-plus-redesign/10-decisions.md`.
- [ ] Elsa entrega Hoy A/B/C sobre el shell elegido.
- [ ] Primer prompt delta a Claude Code: fase 0 (`chore/gitignore-secrets` + merge del fix + `refactor/css-layers`).

Mientras tanto, los archivos `docs/cartera-plus-redesign/00-current-state.md` … `12-progress.md` quedan en el repo como copia de este blueprint y como registro de decisiones, sin commit hasta que Memo lo apruebe.

Nada de lo anterior toca producción.

