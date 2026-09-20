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

## Hallazgos abiertos (de la línea base visual)

- **`/ingresos` y `/control-financiero` desbordan horizontalmente a 390 px.** La captura de página completa sale de **555 px** y **454 px** de ancho respectivamente, contra un viewport de 390: hay contenido que se sale de la pantalla en móvil. Se detectó porque el borde desbordado es justo donde el rasterizado deja tiras inestables entre corridas. Bug de móvil **preexistente**, no introducido por el rediseño; a atender en la fase 1/2.

- **No existen tokens tipográficos (`--fs-*`).** Los tamaños (42/23/17/13,5/11/10,5 px) viven incrustados en cada regla, así que la escala de `/dev/ui` se dibuja con estilos en línea. Tokenizarlos es trabajo de la fase 2.
- **Los alias de tema no voltean en un contenedor.** `--bg: var(--canvas)`, `--pos: var(--success)` y compañía se declaran en `:root` y un alias se resuelve donde se declara: poner `data-theme="dark"` en un `<div>` cambia los tokens DIRECTOS (`--canvas`, `--text`, `--chart-*`, `--success`…) pero deja los alias con el valor claro. Se descubrió al montar la sección oscura de `/dev/ui`. Cualquier componente que quiera un área localmente oscura tiene que usar los directos, o habrá que redeclarar los alias en el bloque `[data-theme="dark"]`.

- **Divisor de «/día prom.» en `/transacciones`**: con TZ local (UTC−6) divide por 29 en septiembre —`new Date(period.to).getDate()` sobre una fecha ISO parseada como UTC—; en Vercel (UTC) da 30. Latente, no afecta prod. Línea: `src/modules/financial-base/services/transaction-service.ts:773` (uso en `:782`, y las dos pantallas móviles consumen el mismo `real.avgDaily`). Pendiente `fix/` con test bajo `TZ=America/Costa_Rica`.
- **Precios de QA**: la línea base depende de `market_price_cache` local; mejora futura: un fixture de precios para las capturas.

- **`eslint.config.mjs`**: el último objeto fija `react-hooks/exhaustive-deps` sin `files`; cualquier archivo fuera de los globs de `eslint-config-next` (p. ej. `.cjs`) aborta ESLint con «could not find plugin react-hooks». Pendiente chore: acotar ese objeto con `files` o registrar el plugin globalmente.

Nada de lo anterior toca producción.

