# Línea base visual actual

Copia local: `qa-snapshots/base/BASE.txt` (ignorado por git). Regenerar según el README,
sección «Servidor congelado».

**Regenerada el 22-sep-2026 desde `main e4cace8b`.** Es la primera vez desde `1c4e9b14`, y
no fue por gusto: las propias corridas de QA habían fabricado presupuesto derivado para
jun/jul/ago 2026 del usuario demo (15 filas, `source_kind` `debt`/`goal`), y eso movía el
«Gasto planificado» y el histórico de `/gastos`, que agregan varios meses. Se borraron esas
15 filas en el Supabase LOCAL —queda solo septiembre, el de la siembra original del 17-sep—
y se capturó de nuevo. La causa está corregida en `fix(budget)`: una lectura ya no escribe
presupuesto de meses pasados.

```
App             : main e4cace8b — base capturada desde main limpio, sin el fix aplicado
                  (el fix se compara CONTRA esta base).
Instante        : 2026-09-18T18:00:00Z  (navegador Y servidor)
TZ del servidor : UTC (como Vercel). El manifest anota tz:null porque ese campo registra
                  el TZ del proceso de CAPTURA, no el del servidor.
Modo            : servidor congelado + red externa bloqueada
                  (npm run qa:start → NODE_OPTIONS=--require scripts/qa/server-freeze.js)
Ambiente        : Supabase LOCAL http://127.0.0.1:54321
Cuenta          : information.theglowup@gmail.com — demo Familia Ramírez
Node / Playwright: v20.20.2 / 1.62.0
Capturas        : 138 = 23 rutas × 3 anchos (390/768/1280) × 2 temas (light/dark)

Determinismo    : dos capturas consecutivas → 132/132 estrictas a 0 px (home excluida),
                  reconfirmado el 22-sep sobre la base regenerada.
                  market_price_cache sin una sola escritura durante las 276 capturas.
                  /empezar muestra "2 de octubre" = 18-sep + 14 días de prueba.
Filas derivadas : usuario demo, solo 2026-09 (3 debt + 2 goal, 970.680). Si aparecen otros
                  meses, alguien navegó el pasado con un build anterior al fix.

Para comparar:
  Terminal A:  QA_FREEZE=2026-09-18T18:00:00Z npm run qa:start
  Terminal B:  QA_FREEZE=2026-09-18T18:00:00Z E2E_EMAIL=… E2E_PASSWORD=… \
                 npm run qa:snap -- --out qa-snapshots/cambio
               npm run qa:diff -- --a qa-snapshots/base --b qa-snapshots/cambio \
                 --exclude home --max-diff-pixels 60 --max-delta 2
  El MISMO QA_FREEZE en las dos terminales. Con el servidor congelado el diff esperado
  es 0 px; los umbrales quedan como margen.

Válida entre días y máquinas mientras market_price_cache local no sea reescrita por una
sesión sin congelar. Si eso pasa, patrimonio / dashboard / mi-rich-life se desvían y hay
que regenerar la base (o levantar el dev server con QA_BLOCK_EXTERNAL=1).
```

## Superficie `/m` — la app móvil

Desde `chore(qa)`, `scripts/qa/routes.json` cubre **38 rutas**: las 23 de la web y los **15
destinos del drawer ☰** de `/m` (`app/(mobile)/m/components/mobile-menu.tsx`, `/m` incluido).
Las de `/m` llevan `superficie: "m"` y se capturan **solo a 390 y 768**: `/m` es un shell de
teléfono con el viewport bloqueado (`viewportFit: cover`, `userScalable: false`), y a 1280 se
vería una pantalla que en un dispositivo real no existe. Una ruta SIN `superficie` es web y
nada cambia para ella.

Total: **198 capturas** = web 23 × 3 anchos × 2 temas (138) + `/m` 15 × 2 anchos × 2 temas (60).

```
App             : main 845ca4a6, bandera APAGADA (la app que hay en producción)
Instante        : 2026-09-18T18:00:00Z  (navegador Y servidor)
Sesión          : la MISMA cookie de Supabase que la web (`sb-127-auth-token`). El login de
                  `tests/a11y/sesion.ts` sirve tal cual para `/m`: no hace falta nada aparte.
Muro de plan    : NO intercepta. `debeRedirigirSinPlan` solo actúa con `plan === "ninguno"`
                  y la cuenta demo tiene `plan = "max"`; las 15 rutas resuelven a sí mismas,
                  sin pasar por `/m/login` ni `/m/sin-plan`.
Determinismo    : dos corridas consecutivas → **las 30 capturas de `/m` a 0 px**. De las 198,
                  solo difieren `home` (excluida, bucle de la portada) e `ingresos` a 390
                  con 17 px — el ruido de fondo del arnés, ya anotado en el backlog.
```

### Visitar `/m/patrimonio` ESCRIBE, y eso movió la base de la web

Al incorporar `/m` al arnés, `/patrimonio` **web** saltó ~10.000 px en las 6 combinaciones
contra la base anterior. No fue el cambio de QA ni una regresión: `m/(app)/patrimonio/page.tsx:40`
llama a `ensureTodaySnapshot()` **al cargar la pantalla** —best-effort e idempotente, y
deliberado: sin eso la tabla se quedaba vacía y el gráfico no aparecía nunca—. La visita del
calentamiento escribió la fila `portfolio_snapshots.date = 2026-09-18` (la fecha congelada),
y el gráfico de patrimonio de la web, que lee `getSnapshotHistory`, ganó el punto «sep 26».

Se comprobó, no se supuso: la caja del diff cae solo en el gráfico (x 307–548, y 713–780), el
recorte muestra la serie terminando en ago 26 antes y en sep 26 después, y la fila nueva está
en la tabla con `created_at` dentro de la ventana de la corrida. `net_worth_snapshots`,
`holding_contributions` y `market_price_cache` no registraron escrituras.

Es la MISMA clase de problema que el presupuesto derivado retroactivo de #819 —una lectura
que escribe—, en otra tabla y otra pantalla. Acá es intencional y no se tocó (este `chore` no
toca producto). La consecuencia práctica sí: **la base se regeneró con el estado ya
estabilizado**, porque tras esa primera escritura el sistema es idempotente (la segunda
corrida da 0 px en `/patrimonio`). La base anterior quedó en `qa-snapshots/base.previa/`.

### Rate-limit del login con el reloj congelado

`QA_FREEZE` congela `Date.now()` **en el servidor**, así que la ventana fija del limitador de
`auth` nunca rota: los logins del arnés se acumulan y a partir de cierto punto todo intento
devuelve «rate-limit excedido» y no se recupera hasta reiniciar el proceso. Pasó tras dos
corridas de capturas más la de accesibilidad. Si el login empieza a fallar sin motivo, es
esto: reiniciá `npm run qa:start`.

## base-nav-v2 — el menú nuevo

Segunda base, para el sidebar v2. No sustituye a la de arriba: **son dos builds distintos**
del mismo commit y no se comparan entre sí. La de arriba (`base`) es la app con la bandera
apagada, y es la que prueba que un delta no cambió nada; esta es la app con el menú nuevo, y
es contra la que se comparan los deltas siguientes de la fase 1.

**Regenerada el 22-sep-2026 desde `main 638c0e32`** (antes: build del delta 4 tomado el
22-sep a las 03:16 UTC, *antes* de que #819 entrara en `main`). Hubo que hacerlo porque esa
captura vieja hacía fallar `/gastos` en las 6 combinaciones del delta 5 con píxeles en el
cuerpo y hasta a 390 px, donde el buscador ni se ve: era deriva de la BD, no código. Contra
la referencia regenerada, `/gastos` a 1280 da exactamente los mismos 5.971 px que el resto
—la franja del buscador— y **0 px** a 390 y 768.

```
Copia local     : qa-snapshots/nav-v2/ (ignorado por git)
App             : main 638c0e32
Bandera         : NEXT_PUBLIC_NAV_V2=1 en el BUILD. Es NEXT_PUBLIC_, o sea que se inlinea al
                  compilar: ponerla solo al arrancar el servidor no enciende nada.
Instante        : 2026-09-18T18:00:00Z — el MISMO que la base, para poder mirar las dos
                  pantallas lado a lado
Modo            : servidor congelado + red externa bloqueada
Ambiente        : Supabase LOCAL http://127.0.0.1:54321 · cuenta demo Familia Ramírez
Capturas        : 138 = 23 rutas x 3 anchos x 2 temas
a11y            : 349 nodos, 0 critical, 3 reglas (medido en el delta 4) — tres MENOS de contraste que con la
                  bandera apagada (352) y ninguna regla nueva. Historial: 351 con el
                  sidebar v2 (#816), 349 con la barra superior v2 (#817), 349 con las
                  pestañas del núcleo.

OJO con la deriva : las propias corridas de QA ESCRIBEN en la BD local (syncDerivedBudget
                  regenera los budget_items derivados al cargar pantallas). El 21-sep a
                  las 22:56 UTC eso cambió el presupuesto del usuario demo y dejó
                  obsoleta la base de /gastos. Antes de culpar a un delta por un diff
                  grande, comparar contra una captura de `main` tomada con el MISMO
                  estado de BD: eso aísla el código de los datos.
```

Regenerar:

```bash
NEXT_PUBLIC_NAV_V2=1 npm run build
# Terminal A
NEXT_PUBLIC_NAV_V2=1 QA_FREEZE=2026-09-18T18:00:00Z npm run qa:start
# Terminal B
QA_FREEZE=2026-09-18T18:00:00Z E2E_EMAIL=... E2E_PASSWORD=... \
  npm run qa:snap -- --out qa-snapshots/nav-v2
```

Las capturas de revision (1280, los dos temas, expandido y colapsado) viven aparte en
`qa-snapshots/nav-v2-review/` y no son una base: son para mirarlas.
