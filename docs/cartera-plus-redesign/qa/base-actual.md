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

## base-nav-v2 — el menú nuevo

Segunda base, para el sidebar v2. No sustituye a la de arriba: **son dos builds distintos**
del mismo commit y no se comparan entre sí. La de arriba (`base`) es la app con la bandera
apagada, y es la que prueba que un delta no cambió nada; esta es la app con el menú nuevo, y
es contra la que se comparan los deltas siguientes de la fase 1.

```
Copia local     : qa-snapshots/nav-v2/ (ignorado por git)
Bandera         : NEXT_PUBLIC_NAV_V2=1 en el BUILD. Es NEXT_PUBLIC_, o sea que se inlinea al
                  compilar: ponerla solo al arrancar el servidor no enciende nada.
Instante        : 2026-09-18T18:00:00Z — el MISMO que la base, para poder mirar las dos
                  pantallas lado a lado
Modo            : servidor congelado + red externa bloqueada
Ambiente        : Supabase LOCAL http://127.0.0.1:54321 · cuenta demo Familia Ramírez
Capturas        : 138 = 23 rutas x 3 anchos x 2 temas
a11y            : 349 nodos, 0 critical, 3 reglas — tres MENOS de contraste que con la
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
