# QA visual y de accesibilidad

Dos suites corren contra el **servidor congelado** (`npm run qa:start`), no contra `next dev`:
las capturas (`qa:snap` / `qa:diff`) y la auditoría de accesibilidad (`npm run test:a11y`).

## Por qué el servidor va congelado

`qa:start` arranca `next start` con el reloj del **servidor** fijo (`QA_FREEZE`) y la red
externa cortada (`QA_BLOCK_EXTERNAL`). Sin eso, «la fecha del primer cobro» y los precios de
mercado cambian entre corridas y una línea base de ayer no compara con una captura de hoy.

## La sesión: UN login por corrida

El `globalSetup` de `playwright.a11y.config.ts` (`tests/a11y/global-setup.ts`) inicia sesión
una vez y guarda el estado en **`.auth/a11y.json`**, ignorado por git. Los specs no inician
sesión: abren su contexto con `storageState: ESTADO_SESION`.

**Esto no es una optimización, es lo que hace que la suite termine.** El limitador de tasa
usa una ventana FIJA, y con el reloj congelado esa ventana **no rota nunca**: el bucket
`auth` se agota y no se recupera mientras el servidor siga vivo. Con un login por spec —eran
nueve— la suite se quedaba sin cupo a media corrida.

Y el síntoma no dice nada del límite. El spec falla con **«Login no navegó tras 3 intentos»**
o con un timeout, que parece un problema de selectores; el 429 solo aparece en el log del
servidor:

```
{"level":"warn","message":"rate-limit excedido","bucket":"auth"}
```

**El limitador NO se desactiva ni se puentea en código de producción.** La regla es correcta
y protege el login de verdad; lo que se arregla es cuántas veces la prueba la toca.

### Si aun así te quedás sin cupo

Reiniciá el servidor congelado: el store degrada a memoria cuando `QA_BLOCK_EXTERNAL` corta
Upstash, así que reiniciar lo vacía.

```bash
pkill -f next-server && npm run qa:start
```

## Recetas

```bash
# Terminal A — servidor congelado
node scripts/dev/con-env.mjs npm run qa:start -- --port 3001 --freeze 2026-09-24T12:00:00-06:00

# Terminal B — accesibilidad (un solo login, reutilizado por los 9 specs)
E2E_EMAIL=… E2E_PASSWORD=… npm run test:a11y

# Terminal B — capturas y comparación
QA_FREEZE=2026-09-24T18:00:00.000Z E2E_EMAIL=… E2E_PASSWORD=… \
  npm run qa:snap -- --out qa-snapshots/base --base-url http://localhost:3001
npm run qa:diff -- --a qa-snapshots/base --b qa-snapshots/cambio \
  --exclude home,dev_ui --max-diff-pixels 60 --max-delta 2 --ignore-delta-below 5
```

El `--freeze` de la captura y el del servidor tienen que ser **el mismo instante**; `qa:start`
lo imprime al arrancar.

## Desde un worktree

Un `git worktree` no lleva los `.env*`. `scripts/dev/con-env.mjs` resuelve el entorno contra
la carpeta principal y se lo pasa al proceso hijo:

```bash
node /ruta/a/la/carpeta-principal/scripts/dev/con-env.mjs --raiz /ruta/a/la/carpeta-principal npm run build
```

## El smoke E2E es aparte

`tests/e2e/smoke.spec.ts` **sí** inicia sesión: el login es lo que prueba. Un login por
corrida, y corre contra `npm run dev` en :3000, no contra el congelado.
