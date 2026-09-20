# Línea base visual actual

Copia local: `qa-snapshots/base/BASE.txt` (ignorado por git). Regenerar según el README,
sección «Servidor congelado».

```
App             : main 1c4e9b14 — esta rama (chore/qa-reloj-servidor) no cambia nada
                  bajo src/; la herramienta vive en scripts/qa/.
Instante        : 2026-09-18T18:00:00Z  (navegador Y servidor)
TZ del servidor : UTC (como Vercel). El manifest anota tz:null porque ese campo registra
                  el TZ del proceso de CAPTURA, no el del servidor.
Modo            : servidor congelado + red externa bloqueada
                  (npm run qa:start → NODE_OPTIONS=--require scripts/qa/server-freeze.js)
Ambiente        : Supabase LOCAL http://127.0.0.1:54321
Cuenta          : information.theglowup@gmail.com — demo Familia Ramírez
Node / Playwright: v20.20.2 / 1.62.0
Capturas        : 138 = 23 rutas × 3 anchos (390/768/1280) × 2 temas (light/dark)

Determinismo    : dos capturas consecutivas → 132/132 estrictas a 0 px (home excluida).
                  market_price_cache sin una sola escritura durante las 276 capturas.
                  /empezar muestra "2 de octubre" = 18-sep + 14 días de prueba.

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
