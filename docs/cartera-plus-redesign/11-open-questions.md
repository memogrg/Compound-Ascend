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
- **Drift de npm**: el lockfile fue generado con npm 11 (escribe `"libc"`) y npm 10 lo borra. Pendiente chore: fijar versión (`engines` / `packageManager` / `.nvmrc`). Sin efecto funcional; `npm ci` no reescribe.

- **`parseMonthParam`** (`financial-base/engine/period.ts:76`) acepta mes 13 (regex `^\d{4}-\d{2}$`) y `monthPeriod` lo **clampea a diciembre, silenciosamente**; `url-state` usa regex estricto. Pendiente `fix/` separado: endurecer `parseMonthParam` + test.

- Shell móvil (`/m`) fuera de la auditoría a11y y de la base visual: agregar rutas `/m` a `routes.json` en un chore propio (implica regenerar la base).

- `tests/a11y/routes.spec.ts` guarda los nodos `incomplete` solo como conteo; guardar `html`/`target` para poder triarlos.

- Copy: `defense-funds-mobile` usa «Dimensiona» (tú) donde el web usa «Dimensioná» (vos).

- `a11y-report.mjs`: marcar el SHA con `-dirty` cuando `git status --porcelain` no esté vacío.

- Con `NAV_V2`, Mi Base muestra **dos selectores de periodo** (el global de la barra superior y el de la propia página); el de la página se retira cuando la pantalla se rediseñe (fase 3/4). Gastos usa `asOf`/`range` en vez de `period`: se unifica en el piloto.

- `BaseTabs` (`financial-base/components/v2/base-tabs.tsx`) y sus estilos `.base-tabs` —que además viven en `modules/auth.css`— son **código muerto**: ningún componente los importa. Mi Base ya muestra solo el Resumen y las demás secciones viven en sus rutas. Pendiente `chore/` de borrado, fuera del alcance de un delta con bandera.

- Las pestañas del núcleo propagan **solo `?period=`** entre rutas. Si una pantalla futura necesita conservar otro parámetro al cambiar de pestaña, hay que decidirlo explícitamente en `nucleo-tabs-items.ts`, no por omisión.

- Con `NAV_V2`, las pestañas del núcleo se ven **tres veces** en `/mis-acciones`: en el sidebar (bajo el núcleo activo), en la barra superior y en la propia pantalla (Este mes · Decisiones · Progreso). Las dos primeras son del rediseño y conviven a propósito hasta decidir cuál se queda; la tercera se retira al rediseñar Hoy.

- `/mis-acciones` **no está en `PAGE_META`** y cae a `DEFAULT_META`, así que su `<h1>` dice «CARTERA+». Es **preexistente** (pasa igual con la barra v1), pero con la v2 se nota más porque el breadcrumb sí dice «Hoy / Progreso». Pendiente: darle su entrada, o que el `h1` caiga al nombre de la pestaña cuando page-meta no tenga una.

- Contraste del par «activo» del design system: `--accent` sobre `--accent-soft` da **3.56** y sobre `--canvas` **4.09**; AA exige 4.5 para texto normal. El sidebar v2 lo usa y aporta 15 nodos de `color-contrast`. Las pestañas de la barra superior lo evitan usando `--text` con subrayado verde, pero el patrón del sidebar sigue pendiente de decisión.

- Frescura: un usuario sin ninguna fila de detector corre los detectores en cada carga; antes del fix la fila del ritual lo enmascaraba y no corrían nunca. Marcador de última corrida pendiente.

- `InsightKind` (`types.ts`) no incluye `alerta_precio` ni `perfil_revision` aunque se escriben.

- `runDetectors` corre 3 de 14 detectores; el resto se invoca a mano desde `refreshInsights`: candidato a registro real.

- **Presupuesto derivado retroactivo — RESUELTO** en `fix(budget)`. Visitar un mes pasado hacía que `loadBaseView` llamara a `syncDerivedBudget`, que creaba las líneas de ese mes **con los montos de hoy**: un presupuesto que nunca existió, y que además movía el «Gasto planificado» y el histórico de `/gastos`, que agregan varios meses. El guard va en el caller de LECTURA (`base-view.ts`) y no dentro de `syncDerivedBudget` (opción A): `rental-service` y `dividend-service` la llaman a propósito con el mes del pago —que puede ser pasado— y necesitan el id de la línea que materializa para `income_source_id`; meter el guard adentro los habría dejado con ese id en null, en silencio.

- Pendiente en la herramienta de QA: **huella de la BD del demo en el manifest** de `snap.mjs` y aviso en `diff.mjs` cuando cambie entre corridas. Sin eso, una diferencia grande obliga a descartar a mano si fue el código o los datos — que es lo que pasó acá.

- `feat/`: rutas que leen `asOf`/`range` y **no consumen `?period=`** (`/gastos` confirmado). Mordió al reproducir el fix del presupuesto derivado: `/gastos?period=2026-05` no dispara nada y el repro parecía ya arreglado en `main`. Unificar con el periodo global en el piloto de Gastos.

- Alta rápida sin deep-link: `/transacciones` **no acepta `?new=expense|income`**, así que las acciones «Registrar gasto» y «Registrar ingreso» de la paleta ⌘K llevan a la pantalla pero no abren el formulario — el alta vive en `QuickAddModal`, sin `useDeepLinkModal`. Los otros cuatro `?new=` (meta, inversión, deuda, póliza) sí abren el suyo. Pendiente: darle a `QuickAddModal` el mismo deep-link que los demás.

- **Paleta de comandos en `/m` — delta 6.** La paleta se monta en `app-shell`, que es el cascarón web; la app móvil tiene su propio layout y no la ve. En móvil el atajo de teclado no aplica, así que el disparador tendría que ser un control visible en su barra, no un ⌘K.

- **Ruido de fondo del arnés visual**: `ingresos` y `control-financiero` a 390 y `asistente` a 768 difieren entre dos corridas del MISMO build, siempre por debajo de 51 px y delta 1-2. Pasa el criterio de dos condiciones, así que no rompe nada, pero es el suelo por debajo del cual el arnés no puede medir. Pendiente: localizar la fuente (animación de entrada, skeleton que se resuelve tarde, fuente que carga después del `networkidle`) y eliminarla, para poder exigir 0 px de verdad.

- `chore`: **`.env.example` da una URL de producción que ya no existe.** Las líneas `NEXT_PUBLIC_APP_URL` y `ALLOWED_ORIGINS` dicen `https://cartera.vercel.app`; el dominio real es `carteraplus.aitechumbrella.com` (y `carteraplus.vercel.app` / `compound-ascend.vercel.app` como alias). Mordió al escribir el smoke de producción del delta 5: `ERR_NAME_NOT_RESOLVED`.

- **Dos mapeadores de rutas web↔móvil en paralelo.** `aMovil` / `aWeb` (`lib/constants/nav-v2.ts:324,329`) derivan el par de la tabla del modelo y **no los consume nadie en `src/`** — solo `tests/unit/nav-v2.test.ts`. El que sí se usa es `aRutaMobile` (`app/(mobile)/m/lib/rutas-web-a-mobile.ts:51`), anterior y con su propia tabla. Dos fuentes para la misma pregunta: o el delta 6 hace que el móvil consuma el modelo, o `aMovil`/`aWeb` sobran.

- **`/m` entró al inventario de a11y: 104 nodos, 0 critical, 3 reglas** (`color-contrast` 57, `aria-hidden-focus` 32, `meta-viewport` 15). Sin `critical`, así que no hay `fix(a11y)` urgente. Dos apuntes: `meta-viewport` (moderate, 1 nodo por ruta) es la **decisión deliberada** de `m/layout.tsx:24-36` —escalado bloqueado para que el WebView se comporte como app nativa, con el zoom del SISTEMA intacto—; si se quiere cerrar la regla hay que decidir antes si se renuncia a eso. `aria-hidden-focus` pesa el doble que en la web (32 vs 14) y sale sobre todo de `/m/gastos` y `/m/transacciones`.

- **Una lectura de `/m` escribe: `ensureTodaySnapshot()` en `m/(app)/patrimonio/page.tsx:40`.** Cargar la pantalla inserta la fila de hoy en `portfolio_snapshots`, lo que movió el gráfico de `/patrimonio` **web** en cuanto el arnés empezó a visitar `/m`. Es intencional y está documentado en el propio fuente, pero es la misma forma que el bug de #819: quien mide acaba modificando lo medido. Pendiente: decidir si el punto lo escribe el cron (`/api/investments/snapshot`) en vez de la pantalla, o si el arnés visita `/m/patrimonio` con una marca que suprima la escritura.

- **El rate-limit de `auth` no caduca con el reloj congelado.** `QA_FREEZE` congela `Date.now()` en el servidor y la ventana fija del limitador nunca rota, así que los logins del arnés se acumulan hasta agotar el bucket y solo se recupera reiniciando el proceso. Pendiente: que `RATE_LIMITS` use un reloj que el congelador no toque, o exceptuar el bucket cuando `QA_FREEZE` está presente.

- **Un solo login por corrida de a11y.** Cada spec de `tests/a11y/` hace el suyo en su `beforeAll`; con tres specs son tres logins por corrida, y el bucket `auth` no caduca con el reloj congelado (ver arriba). Pendiente: un `storageState` global de Playwright (`globalSetup` + `use.storageState`) para iniciar sesión una vez.

- **Job de a11y con bandera ENCENDIDA en CI.** Hoy `npm run test:a11y` corre contra un servidor construido con la bandera apagada, así que los specs de la paleta ⌘K y de `/m` v2 se saltan solos y nadie los ejecuta salvo a mano. Pendiente: un job aparte que construya con `NEXT_PUBLIC_NAV_V2=1` y corra solo esos specs.

- **`meta-viewport` en `/m` (moderate, 1 nodo por ruta, 15 en total).** Es WCAG 1.4.4: el layout móvil bloquea el escalado (`maximumScale: 1`, `userScalable: false`) para que el WebView se comporte como app nativa, con el argumento —escrito en `m/layout.tsx:24-36`— de que el zoom del SISTEMA sigue disponible. **Decisión de Memo**, no de un delta: cerrar la regla es renunciar al pellizco dentro de la app.

- **`fix(a11y)` posterior: `aria-hidden-focus` en `/m`.** 32 nodos, el doble que en la web (14), concentrados en `/m/gastos` y `/m/transacciones`. No es de este delta —ya estaba en la línea base— y no hay `critical`, así que va aparte.

- **`/m/asistente` no está en `routes.json`.** Se añadieron los 15 destinos del drawer ☰, y el chat se alcanza desde la acción del header, no desde el drawer. Queda sin cobertura visual ni de a11y. Pendiente: decidir si entra como ruta 16.

- **Dos formateadores de eje conviviendo: `formatCompact` y `formatAxisCompact`** (`lib/format.ts:162` y `:186`). El área usa uno y la línea el otro, y `/mi-base-financiera` monta las dos en la misma pantalla, así que sus ejes no se leen igual. Unificar en el **delta 7** de esta fase (`refactor/charts-wrappers-delegate`), cuando los tres wrappers pasen por el núcleo y haya un solo sitio donde decidirlo.

- **`MScrubChart` va `aria-hidden` entero** (`m/components/m-scrub-chart.tsx:72,147`): su dato no llega a un lector de pantalla. No se toca en la fase 2 —el núcleo se construye para la web primero— y se resuelve al migrarlo al `ChartFrame` en la fase 4 móvil, que es cuando hereda la tabla.

- **Tres lecturas que escriben, como comportamiento CONOCIDO del arnés**: `ensureTodaySnapshot` (`m/(app)/patrimonio/page.tsx:40` → `portfolio_snapshots`), `ensureCurrentNetWorthSnapshot` (`m/(app)/patrimonio:44`, `(dashboard)/mi-rich-life:25` → `net_worth_snapshots`) y `ensureMonthlyContributions` (`(dashboard)/patrimonio:38`, `m/(app)/inversiones:35` → `holding_contributions` + `investment_transactions`). Las tres alimentan gráficos, y las tres completan su propia serie al mirarla. Ya movieron la base una vez; antes de culpar a un delta por un diff en Patrimonio, comprobar si fue una de estas.

- **Ruido de arnés, ampliado**: a `ingresos` y `control-financiero` a 390 y `asistente` a 768 se suma **`/m/mis-acciones` a 390** (franja del `.m-seg`, ~182 px de valor ≤4 por canal: con umbral 5 la diferencia es 0). Aparece entre builds sucesivos del MISMO código, así que es del arnés, no de un delta. Sigue pendiente localizar la fuente.

- **Dependencias de la fase 2, diferidas a propósito**: `@number-flow/react` entra en el **delta 3** (`feat/kpi-hero-card`), que es cuando hay un KPI que animar; `echarts` **modular** en el **delta 5** (`feat/echarts-wrapper-theme`), con el presupuesto de peso que fija el BLUEPRINT (§14): solo en los chunks de Patrimonio, Deudas, Gastos y Resumen, y `echarts` fuera del chunk cliente de `/dashboard`. Este delta no instaló nada.

- **Tres implementaciones de «ago 26»**: `formatMonthShort` (`lib/format.ts:257`), `formatMonthYear` (`:144`, que da «ago 2026») y una privada dentro de `area-chart.tsx:43` con su propio array de meses (`:41`). El núcleo de gráficos usa una sola —`formatoEjeX`, que delega en `formatMonthShort`— pero los tres wrappers viejos siguen con lo suyo, y `line-chart` ni siquiera formatea el eje X. Unificar en el **delta 7** (`refactor/charts-wrappers-delegate`), junto con `formatCompact`/`formatAxisCompact`.

- **`/dev/ui` solo existe en local y en previews.** La página hace `notFound()` cuando `VERCEL_ENV === "production"` (doble puerta: eso más la sesión que exige `(dashboard)`), así que en el dominio real devuelve **404 por diseño**. Un smoke de producción que espere verla fallará, y el fallo sería del smoke. Para revisarla en remoto hay que abrir el preview del PR.
- **La cifra animada del hero no es texto: no se selecciona, no se copia y no la encuentra Ctrl+F.** NumberFlow pinta dentro de un shadow root donde cada posición apila los diez dígitos y el visible se elige con un `transform`; el `textContent` es `₡0123456789.0123456789…` y el `innerText` del host, cadena vacía. El número entero sí está en el DOM, en el `sr-only` que lee el lector de pantalla, pero clipeado. Aceptable en un titular; **no** lo sería en un importe de transacción, así que `KpiCard` y todo lo que se escriba en la fase 4 siguen usando `formatMoney` en texto plano. Pendiente: decidir si el hero necesita un modo «copiar» explícito.

- **La coincidencia con `formatMoney` depende de que `de-DE` siga agrupando con punto.** `numero-animado.ts` no elige ese locale por idioma sino por su gramática numérica, que es la única de `Intl` que coincide con `format.ts`. Si CLDR cambiara esa agrupación, el hero y las tarjetas empezarían a decir cosas distintas; lo detecta `tests/unit/kpi.test.tsx`, que compara carácter a carácter, pero conviene saber de dónde vendría el fallo.

- **Los runners quedan fijados a `ubuntu-24.04`, y eso es una deuda con fecha.** `ubuntu-latest` migra a **Ubuntu 26 el 19 de octubre de 2026**, y una migración de imagen que llega sola el día que toca no es una decisión: es una sorpresa que aparece como CI en rojo sin que nadie haya tocado el repo. Pendiente: probar Ubuntu 26 en una rama —`runs-on: ubuntu-26.04` en los 7 sitios, las tres corridas verdes de rigor— y subir el pin a conciencia antes de esa fecha, no después.

- **`KIND_HREF` de la campana vive en paralelo a `ACTIONS`.** `bell-notifications.tsx:23` tiene su propio mapa de cinco tipos, mientras `lib/insights/actions.ts` cubre los 26 y es lo que usa el asesor —y ahora `desdeInsight` de las primitivas de lectura—. Los tipos que no están en el mapa de la campana no llevan enlace, y el que difiera no se nota hasta que alguien compara. Pendiente: que la campana lea `suggestedAction(kind)` y borrar `KIND_HREF`. No se toca en la fase 2 porque `bell-notifications.tsx` está fuera del alcance del delta.

- **`MSectionHeader` y `.card-title` a migrar a `SectionHeader` (fase 3).** Hoy la cabecera de sección existe tres veces: `MSectionHeader` en `/m` (14 líneas, solo título y acción), la clase `.card-title` repetida a mano en la web, y ahora `SectionHeader` con nivel, eyebrow, ayuda y toolbar. Las tres conviven a propósito hasta que las pantallas migren; el objetivo del audit (§17) es que quede una.

- **`--s-neutral` quedó sin uso.** Lo usaba el `RING_COLORS` de `/m`, que se eliminó; el token sigue declarado en `mobile.css:66` y `:175`. No se quita porque `mobile.css` está fuera de alcance por regla del proyecto.
- **`CONC_PALETTE` de `/patrimonio` se resuelve en la fase 4, cambiando la dona.** El anillo de categorías reparte NUEVE colores por POSICIÓN entre hasta **23** categorías: con tokens de estado, una colisión interna (`--gold` y `--warn` son los dos `#b07a2e`) y el color siguiendo al ranking. No tiene arreglo por asignación —**23 entidades no admiten colores únicos**— así que la salida es cambiar la pieza: en la fase 4 esa dona pasa a `BreakdownCard`, barras ordenadas **en un solo tono**, donde el color deja de ser el canal que distingue y lo hacen el orden, la etiqueta y la longitud. Hasta entonces, la unicidad por pantalla en `/patrimonio` está garantizada para el anillo de naturaleza y no para el de categorías.

- **~~La paleta categórica NO está validada para daltonismo~~ — RESUELTO el 2026-09-24 (`feat/paleta-cvd`).** Al medirlo en serio no se caía un par, sino **tres**: `--chart-2`/`--chart-4` (azul y morado) en **ΔE 1,2** bajo protanopía en oscuro —bajo el umbral de percepción (~2,3), o sea el MISMO color—, `--chart-1`/`--chart-5` (el verde y el rojo, la confusión clásica) en 5,3-6,0, y `--chart-1`/`--chart-2` en 3,6 bajo tritanopía. Los dos últimos se escaparon porque el test solo miraba el mínimo GLOBAL. La corrección no es re-espaciar los tonos como se suponía: se separan por **luminosidad**, que es lo único que sobrevive a la dicromacia, y con eso los 15 pares pasan de ΔE 8 en las cuatro visiones y los dos temas moviendo solo `--chart-2`, `--chart-4` y `--chart-5` unos ΔE 2-6 (invisible al lado). `--chart-1`, el verde de marca, no se toca. El validador ahora exige TODO par contra TODO par: «adyacente» es un orden de la leyenda, no del ojo, y el par que fallaba no era adyacente.

- **`shell-nav-movil.css:2` no oculta la barra inferior, y no se toca a propósito.** El fichero declara `.bottom-nav { display: none }` sin condición, pero se importa en `globals.css:10`, **antes** de `responsive.css` (línea 11), cuyo `@media (max-width: 820px)` la vuelve a poner en `display: grid` (`responsive.css:90`). Misma especificidad —una clase— así que decide el orden de fuente y gana la segunda. En la práctica ese `display: none` solo la oculta **por encima de 820 px**, que es lo que hace falta; el nombre del fichero y el comentario («NAVEGACIÓN INFERIOR MÓVIL») hacen pensar lo contrario y ya costó un rato entenderlo. Ordenarlo —mover la regla dentro de una media query `min-width` o cambiar el orden de import— cambiaría el comportamiento **con la bandera apagada**, así que no entra en el delta de la barra v2. Pendiente: hacerlo en un PR propio, con diff visual OFF a 0 px como criterio.

Nada de lo anterior toca producción.

