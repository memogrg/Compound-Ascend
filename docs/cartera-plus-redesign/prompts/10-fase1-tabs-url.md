# Prompt 1.4 — feat/redesign-1-tabs-url (pestañas del núcleo y subpestañas en la URL)

---

Fase 1 · delta 4 — `feat/tabs-url`. Rama `feat/redesign-1-tabs-url` desde `main`. Detrás de `navV2Enabled()`; bandera apagada = píxel idéntico.

Referencias: `03-navigation.md` (pestañas del núcleo bajo el título, viven en la URL; se eliminan las pestañas por `#hash`), `prototipos/01-shell.html` `topB` `.tabs`, `nav-v2.ts` (`pestanaDeRuta`, `NUCLEOS`), `topbar-v2.tsx`.

Antes de escribir: verificá que no existan `nucleo-tabs.tsx`, `nucleo-tabs-items.ts`, `tests/unit/nucleo-tabs.test.ts`. Leé `base-tabs.tsx`, `portfolio-view.tsx` (`SUBTABS` y el hash), `mis-acciones/page.tsx` (`?tab=`).

1. `src/components/layout/nucleo-tabs.tsx` (`"use client"`) + `src/components/layout/nucleo-tabs-items.ts` (puro): barra horizontal de pestañas del núcleo activo bajo el título en `TopbarV2`. Ítems = pestañas con status `"existente"`; enlaces `<Link>` (no `role=tablist`: es navegación) con `aria-current="page"` en la activa. Conservar el periodo: si la URL actual tiene `?period=`, cada enlace lo lleva; no propagar otros parámetros salvo `tab` cuando la pestaña lo define. Con una sola pestaña (Asesor) no se renderiza la barra. Scroll horizontal a 390 px sin envolver. Contadores por props, sin datos aún.
2. Mi Base bajo `NAV_V2`: `BaseTabs` recibe prop `soloResumen`; con ella renderiza únicamente el primer panel, sin tablist ni lectura de hash. Con la bandera apagada, idéntico a hoy. Anotar en `11-open-questions.md`.
3. Inversiones bajo `NAV_V2`: `portfolio-view` lee/escribe la subpestaña con `useQueryState("tab", parseAsStringLiteral([...]).withDefault("portafolio"))` (shallow: true) en lugar de `window.location.hash`; con la bandera apagada sigue el hash.
4. CSS en `shell-topbar-v2.css` (prefijo `tb2-tabs-`), tokens existentes.
5. Tests: `nucleo-tabs.test.ts` (ítems por ruta, activa correcta, propagación del periodo) y test puro de la subpestaña de Inversiones.
6. Verificación: cadena completa; bandera OFF con `qa:diff` exit 0; bandera ON con base rehecha, a11y sin reglas nuevas, consola limpia; funcional con Playwright; capturas en `qa-snapshots/tabs-review/`.
7. Docs: `prompts/10-fase1-tabs-url.md`; `12-progress.md`. Commit:
   `feat(nav): pestañas del núcleo bajo el título y subpestañas en la URL (adiós #hash) detrás de NAV_V2`

---

## Lo que se hizo, y prevalece

**El punto 2 no aplicaba: `BaseTabs` es código muerto.** Ningún componente lo importa, no está en el barrel del módulo y solo su propio fichero lo menciona; sus estilos `.base-tabs` viven además en `modules/auth.css`, también sin consumidores. **Mi Base ya muestra solo el Resumen** — su `page.tsx` renderiza `BaseHeader` + `MiBaseSection` y su comentario dice que Ingresos, Gastos y Transacciones viven en sus rutas. La migración que el prompt pedía ya había ocurrido, así que no hay `soloResumen` que pasar y no se tocó nada. El borrado de `BaseTabs` queda anotado como `chore/` aparte: borrar código muerto dentro de un delta con bandera mezcla dos cosas que conviene poder revertir por separado.

**La barra de pestañas NO lleva `role="tablist"`.** Un tablist promete paneles que se intercambian en la misma página; esto son rutas distintas, y anunciarlo así haría que un lector de pantalla espere flechas para moverse entre paneles que no existen. Son enlaces con `aria-current="page"`, que es como se marca el destino actual. (Esto sí lo pedía el prompt; queda escrito porque es la clase de decisión que alguien "corrige" después.)

**El periodo es el único parámetro que viaja.** `?deuda=` de Acciones o `?cat=` de Transacciones pertenecen a su pantalla, y arrastrarlos a otra daría un filtro que nadie pidió. El `?tab=` no se propaga, se respeta: viene del propio `href` de la pestaña, que es quien lo define — y el test comprueba que añadir el periodo no lo pise.

**El contador del núcleo va en SU pestaña, no repetido en todas.** El de «Hoy» cuenta acciones pendientes, que viven en la pestaña Acciones; pintarlo también en Panel y Progreso diría que hay tres cosas pendientes en tres sitios.

**Los dos hooks de la subpestaña se llaman siempre.** React no admite hooks condicionales, así que `portfolio-view` llama a `useQueryState` y al `useState` del hash en todos los renders y la bandera solo decide cuál manda. `useQueryState` solo LEE hasta que se invoca su setter, así que con la bandera apagada es inerte y no escribe `?tab=`. El `shallow` se deja en su valor por defecto (`true`) a propósito: la subpestaña es estado de cliente — la página ya trae los tres paneles y no hay nada que recalcular en el servidor. Es lo contrario del `PeriodControl` del delta 3, que sí necesita `shallow: false`.

**Las pestañas ocupan su propia fila.** `.topbar` es una fila flex (título ↔ acciones) y un tercer hijo competiría por el ancho con el buscador; `flex-basis: 100%` más el wrap del contenedor las baja enteras. A 390 px se desplazan en horizontal en vez de envolver —una barra de pestañas de dos líneas deja de leerse como una barra— y se salen del padding lateral para que el scroll llegue al borde.

**La comparación con la bandera apagada falló contra la base, y no era el delta.** `/gastos` daba ~16 000 px de diferencia en las 6 combinaciones. La causa es que **las propias corridas de QA escriben en la BD**: `syncDerivedBudget` regenera los `budget_items` derivados al cargar pantallas, y eso ocurrió el 21-sep a las 22:56 UTC —cinco minutos después de terminar la captura del delta 3— durante las corridas con bandera encendida. Se aisló código de datos capturando `main` con el MISMO estado de BD: `main` vs delta con la bandera apagada da **exit 0**. La base quedaba obsoleta, no el delta. Anotado en `qa/base-actual.md`.

**La pestaña activa no usa el par «activo» del sidebar.** `--accent` sobre `--accent-soft` da 3.56 y sobre el fondo de la topbar (`--canvas`) 4.09; AA exige 4.5 para texto normal, y 13 px en semibold no llega a «texto grande» (18.66 px bold). Con el fondo suave, `color-contrast` subía de 291 a 318 — **27 nodos nuevos, todos míos**. La pestaña activa acabó en `--text` (15.22) con el verde solo en el subrayado, lo que además deja de depender del color como único indicador (WCAG 1.4.1). Resultado: 349 nodos, los mismos que el delta 3, y **0 aportados por las pestañas**. El patrón del sidebar sigue igual y queda anotado.

**`history: "push"` en la subpestaña de Inversiones.** El default de nuqs es `replace`, con el que «atrás» se salía de Patrimonio; el hash que se retira sí apilaba historial. Se conserva el comportamiento anterior, que además es lo que pide 03-navigation sobre el botón atrás.

**Dos cosas que las capturas dejaron ver y no se tocaron**: las pestañas aparecen **tres veces** en `/mis-acciones` (sidebar, barra superior y la propia pantalla), y su `<h1>` dice «CARTERA+» porque la ruta no está en `PAGE_META` y cae al default — preexistente, pasa igual con la barra v1. Las dos, anotadas.

