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

## Dos guardas que no se pueden saltar por descuido

### 1 · La base local tiene que estar al día

`qa:start` no arranca si `supabase/migrations/` tiene algo que la base local no. Las nombra y da
el comando para aplicarlas:

```
  ✖ La base local va 1 migración(es) por detrás del repo.

    Faltan por aplicar:
      20260828000001

    Aplicalas con:
      supabase db push --local   # o, si ya están aplicadas a mano: supabase migration repair --status applied 20260828000001
```

**Por qué existe.** `/patrimonio` mostraba ₡0 con dos posiciones en la tabla. No era el código:
la base local iba 24 migraciones por detrás, `investment_holdings` no tenía las columnas
`payout_*`, el `select` de `listHoldings` devolvía 400 y `(data ?? [])` lo convertía en «este
usuario no tiene inversiones». Una pantalla vacía, correcta según la app, y una captura que no
significaba nada. El job «Migraciones aplican en BD fresca» no lo caza: prueba que las
migraciones corren sobre una base vacía, no que la tuya esté al día.

El estado se lee con `supabase migration list --local`, así que hace falta el CLI y el stack
levantado. `QA_SKIP_MIGRACIONES=1` la salta y lo dice en voz alta; lo que se capture así **no
vale como evidencia**, por el mismo motivo por el que la guarda existe.

**En CI no corre.** Allí el job crea la base desde cero aplicando `supabase/migrations/` en ese
mismo job, así que la paridad está garantizada por construcción; y el CLI de Supabase no está en
el PATH del runner, con lo cual la guarda solo podría fallar por no poder leer.

### 2 · Un diff parcial se anuncia, y falla

`qa:snap --rutas /gastos,/dashboard` captura solo esas: sirve para **iterar** sin pagar los
cuarenta minutos del inventario completo. Pero un diff parcial y uno completo se ven igual —una
lista de imágenes y un «sin diferencias»—, así que `qa:diff` lo dice y sale con código distinto
de 0:

```
PARCIAL: 6 de 200 capturas del inventario (39 rutas de routes.json, en sus anchos y los dos temas).
  Un diff parcial NO es evidencia de un PR: solo dice que lo que se miró no cambió.
  Para la evidencia, capturá sin `--rutas`.
```

**La evidencia de un PR es el diff completo de `routes.json`.** `--rutas` es para el rato en que
se está iterando, no para el PR.

<!-- Una línea, a propósito: este cambio existe para comprobar que una rama NUEVA acierta la
     caché de imágenes poblada en `main`. Si acierta, los tres jobs dicen «Cache restored from
     key» y ninguno descarga nada. -->

## Dónde vive la evidencia: local se itera, CI mide

Desde el acelerador visual (`chore/ci-diff-visual`), la regla es corta:

- **En local se ITERA.** `--rutas /gastos,/ingresos` está permitido y es lo sensato: capturar
  las 200 pantallas para mirar dos son 40 minutos. El diff parcial se marca como PARCIAL y no
  vale como evidencia — solo dice que lo que se miró no cambió.
- **La evidencia la produce CI.** Cada push a `main` captura el juego completo y lo sube como
  artefacto `capturas-<sha>`; cada PR captura su rama, baja el artefacto del **merge-base** y
  compara con el criterio estricto. El resultado es un artefacto con el reporte, los PNG de lo
  que cambió y una página `comparacion.html` con el antes, el después y la diferencia lado a
  lado, solo de las capturas que se movieron.

No es burocracia: es que la captura a mano es donde se colaron todas las medidas falsas de
esta semana —un puerto ocupado sirviendo otro commit, una compilación bajo el servidor vivo,
dos capturas con orígenes distintos—. En CI el entorno es de un solo uso y las guardas del
arnés corren igual.

La base es el **merge-base**, no la punta de `main`: comparar contra una punta que ya avanzó
mete en el diff los cambios de otros PR y el veredicto deja de ser sobre el tuyo.

## Aprobación visual (`qa/visual-aprobado.json`)

Un cambio visual **a propósito** —el correo de la cuenta demo, un color de sistema, un rediseño
de tarjeta— hace que el diff visual repruebe, y hace bien: eso es exactamente lo que vino a
detectar. Lo que faltaba era una forma de decir «esto lo miré y está bien» sin mergear en rojo.

**El fichero solo se escribe con aprobación ESCRITA de Memo, y por captura.** No es un trámite:
es el único punto del arnés donde una persona sustituye a la medida, y lo que lo mantiene honesto
es que no se pueda hacer a la ligera.

```json
{
  "pr": 899,
  "capturas": [
    {
      "ruta": "/configuracion",
      "tema": "light",
      "ancho": 1280,
      "sha256_despues": "<los 64 hex que imprime shasum -a 256>"
    }
  ]
}
```

Tres cosas que hacen que no sea un sello de goma:

1. **Se aprueba un PNG, no una ruta.** `sha256_despues` es el hash del fichero «después» exacto.
   Si la pantalla vuelve a cambiar, el hash deja de coincidir y la aprobación **caduca sola**. No
   hay forma de aprobar `/configuracion` «en general».
2. **Se aprueba para UN PR.** `pr` tiene que coincidir con el que corre. Un fichero olvidado en la
   rama no cubre el cambio siguiente.
3. **Una aprobación que ya no corresponde a nada hace FALLAR**, no sobra en silencio. Si sobrara,
   el fichero se llenaría de aprobaciones viejas y la siguiente persona no sabría cuáles siguen
   vivas.

En `push` a `main` el fichero **se ignora**: una base no se aprueba, se compara contra ella.

El hash se saca del artefacto `comparacion-visual-pr<N>`, de la carpeta `despues/`:

```bash
shasum -a 256 despues/light/1280/configuracion.png
```

Y el fichero se borra en cuanto el PR se mergea: vive con el cambio que aprueba, no en el repo.
