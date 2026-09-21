# Prompt 1.3 — feat/redesign-1-topbar-period (barra superior v2 y periodo global)

---

Fase 1 · delta 3 — `feat/topbar-period`. Rama `feat/redesign-1-topbar-period` desde `main`. Solo UI, detrás de `navV2Enabled()`; bandera apagada = píxel idéntico.

Referencias: `03-navigation.md` «Barra superior», `prototipos/01-shell.html` `topB` (crumb + `.period` con ‹ › + `.cmp`), `src/lib/url-state/period.ts` (`periodParser`, `comparisonParser`), `src/modules/financial-base/components/v2/period-selector.tsx` (lógica de opciones ±meses, reutilizable), `src/components/layout/topbar.tsx` (actual).

Antes de escribir: verificá que no existan `topbar-v2.tsx`, `period-control.tsx`, `shell-topbar-v2.css`, `tests/unit/period-control.test.ts`. Confirmá qué páginas del `(dashboard)` leen `searchParams.period` hoy (esperado: mi-base-financiera, ingresos, transacciones) y con qué nombre lee Gastos (`asOf`/`range`).

1. `src/components/layout/period-control.tsx` (`"use client"`): selector global de periodo con nuqs: `useQueryState("period", periodParser.withOptions({ shallow: false, history: "push" }))` — `shallow:false` es obligatorio porque las páginas son server components que leen `searchParams`. Prop `defaultPeriod: string` (YYYY-MM del usuario, viene del servidor) para el render sin `?period=`. UI = botón ‹, etiqueta "sep 2026" (`formatMonthShort` de `format.ts` o el label de `period-selector.tsx`, sin `Intl`), botón › (deshabilitado más allá de +1 mes), y un `<select>` visualmente integrado con las mismas opciones de `buildOptions` (extraé `buildOptions`/`label` de `period-selector.tsx` a un módulo puro compartido `src/lib/url-state/period-options.ts` en vez de duplicar; `period-selector.tsx` pasa a importarlo, sin cambiar su comportamiento). Chip de comparación: `useQueryState("vs", comparisonParser)` con un `<select>` pequeño «vs mes anterior / vs mismo mes año anterior / vs presupuesto / vs promedio 3 m» según la lista de `comparisonParser`; solo escribe la URL, ningún consumidor todavía. Todo con `aria-label` en español.
2. `src/components/layout/topbar-v2.tsx`: mismo esqueleto que `Topbar` (hamburguesa, acciones de la derecha idénticas: buscador decorativo, moneda, campana, engrane, tema) pero el breadcrumb sale de `breadcrumb(pathname, search)` de nav-v2 («Flujo / Gastos y sobres»); el `h1` sigue siendo el de `resolvePageMeta` (no se pierde «Tus gastos»). `PeriodControl` a la derecha del título (como `topB`). En rutas donde `nucleoDeRuta` devuelve `null` (configuración, etc.) el breadcrumb cae al de page-meta y el `PeriodControl` no se muestra.
3. `app-shell.tsx`: prop nueva `defaultPeriod?: string`; con `navV2Enabled()` monta `TopbarV2`, si no `Topbar` intacto. `src/app/(dashboard)/layout.tsx`: calcular `defaultPeriod = monthParam(await userCurrentPeriod())` (ambos ya existen) y pasarlo. Es el único cambio fuera de components/styles y es solo props.
4. `src/styles/shell-topbar-v2.css` (capa `ca`, prefijo `tb2-`), tokens existentes; `topbar.css`/`shell.css` intactos. A 390 px el control de periodo baja bajo el título.
5. Tests: `tests/unit/period-options.test.ts` (opciones ancladas al mes real, +1 futuro, 18 atrás, inserción del deep-link viejo, orden descendente; con fecha inyectada, sin `Date.now`) y `tests/unit/url-state-period.test.ts` extendido si `comparisonParser` cambió. No hay RTL: la lógica de habilitar ›/‹ va en una función pura testeada.
6. Verificación: cadena completa; bandera OFF con `qa:diff` exit 0; bandera ON con base `nav-v2` rehecha, `test:a11y` sin reglas nuevas, consola limpia; prueba funcional con Playwright; capturas de revisión.
7. Docs: `prompts/09-fase1-topbar-period.md`; `12-progress.md`; nota en `11-open-questions.md` sobre el doble selector y `asOf`/`range` de Gastos.
8. `git status` + `git diff --stat` y esperar el ok para commitear como:
   `feat(nav): barra superior v2 con breadcrumb desde nav-v2 y periodo global en la URL (nuqs)`

---

## Lo que se hizo, y prevalece

**Un bug del delta 2 apareció en la primera captura a 390 px con la bandera encendida, y está arreglado aquí.** `shell-nav-v2.css` declaraba `.sb2 { position: relative }`. Misma especificidad que `.sidebar` de `responsive.css`, y como el fichero se importa **después**, ganaba: bajo 1024 px el aside dejaba de ser `fixed`, volvía a ocupar una fila del grid y **empujaba todo el contenido 100dvh hacia abajo** — la pantalla se veía vacía. La regla era innecesaria: `.sidebar` ya es `sticky` en escritorio y `fixed` en móvil, y las dos sirven de ancla para el `.sb2-toggle` absoluto. Se eliminó. El bug ya estaba mergeado en `main` (#816), invisible con la bandera apagada.

**`ingresos` lee `period` Y `range`**, no solo `period` como decía el supuesto del prompt. `gastos` usa `asOf`/`range` y no lee `period`, como sí se anticipaba. El resto (`mi-base-financiera`, `transacciones`) lee solo `period`.

**La etiqueta usa el label de `period-selector`, no `formatMonthShort`.** El prompt ofrecía las dos: `formatMonthShort("2026-09")` da «sep 26» (año de dos cifras) y el prototipo pide «sep 2026». Usar el mismo label que el `<select>` evita además que la píldora y el menú muestren el año de forma distinta.

**El `<select>` de comparación valida contra la lista en vez de castear.** `e.target.value` es `string` y el parser espera uno de los cuatro literales; se busca en `COMPARISON_MODES` y solo se escribe si coincide. Un cast habría compilado igual y dejado entrar cualquier cosa.

**Los selects son invisibles y el foco lo pinta el contenedor.** El patrón del prototipo es texto que se comporta como menú; un `<select>` nativo no se puede estilar por dentro de forma fiable, así que el texto visible es un hermano y el select va encima con `opacity: 0` (más `appearance: none`, porque Safari dibuja su flecha igual). Como el select es invisible, el anillo de foco lo pone `:focus-within` del contenedor: sin eso, tabular hasta el mes no mostraría nada.

**El control no se monta fuera del modelo.** En `/configuracion` y demás, `nucleoDeRuta` devuelve `null`: ni breadcrumb de nav-v2 ni periodo. Un selector de mes en «Cuenta y plan» no significa nada. Verificado: 0 controles en esa ruta.

**`defaultPeriod` se resuelve en el servidor**, en el layout de `(dashboard)`, porque depende de la zona del usuario — derivarlo en el navegador le mostraría otro mes a quien viaja. Es best-effort: sin sesión el control no se monta y el valor no se usa.

**La prueba funcional afirma sobre un dato del SERVIDOR, no sobre la URL.** Que la URL cambie no prueba que `shallow: false` funcione. El assert compara «Ingresos reales» entre meses: ₡575.000 en septiembre y ₡1.924.500 en agosto. Si el shallow volviera al valor por defecto, la URL cambiaría igual y el dato no.
