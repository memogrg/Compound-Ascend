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

Nada de lo anterior toca producción.

