# QA visual — línea base y diff

1. **Servidor de producción** (nunca `next dev`: StrictMode corre los efectos dos veces y las
   animaciones por scroll no llegan a verse): `npm run build && npm run start -- -p 3001`.
2. **Línea base**: `E2E_EMAIL=information.theglowup@gmail.com E2E_PASSWORD=… npm run qa:snap -- --out qa-snapshots/base`
   (23 rutas × 3 anchos × 2 temas; `--theme`, `--widths` y `--base-url` ajustan el alcance).
3. **Tras el cambio**: `… npm run qa:snap -- --out qa-snapshots/cambio`.
4. **Comparar**:
   `npm run qa:diff -- --a qa-snapshots/base --b qa-snapshots/cambio --exclude home --max-diff-pixels 60 --max-delta 2`
   — imprime píxeles distintos y delta máximo por imagen, escribe los PNG de diferencias y sale
   con 1 si alguna reprueba. Lo excluido se compara y se reporta igual, pero no hace fallar.

## Criterio de aceptación: dos condiciones, no una

Una imagen **reprueba si se pasa de CUALQUIERA** de las dos: más de `--max-diff-pixels` píxeles
distintos, **o** un delta por canal mayor que `--max-delta`. Para el refactor de CSS:
`--max-diff-pixels 60 --max-delta 2`.

El porqué, medido: el rasterizado de Chromium deja tiras inestables de ~3 px en los bordes —hasta
**51 px con delta 1-2**— y no siempre en la misma pantalla: entre dos corridas saltaron de
`/ingresos` a `/control-financiero` y `/asistente`. Un cambio de CSS real no se parece a eso: o
mueve **miles** de píxeles (layout, tipografía, espaciado), o mueve pocos pero con **delta ≥ 3**
(un color distinto). Las dos condiciones juntas dejan pasar el ruido y no dejan pasar un cambio.

Lo que NO se hace, y por qué: **bajar `--threshold` a 2** taparía el ruido, pero también un cambio
de color real de 1-2 niveles en cualquier pantalla — justo la regresión que un refactor de tokens
puede introducir. `--threshold` se queda en 0: la sensibilidad al color no se toca.

## Determinismo: qué hace la herramienta para que dos corridas den 0 píxeles

Sin esto, dos corridas idénticas diferían en 9 de 138 imágenes y el diff no servía para nada. Cada
pieza cierra una causa distinta, medida:

- **Reloj congelado en el día de la corrida** (hoy a las 12:00 `America/Costa_Rica`, o `--freeze
<ISO>`; queda escrito en el manifest). Una fecha fija dejaba al navegador en un día y al servidor
  en otro, y ese desfase producía desajustes de hidratación (React #418) en `/deudas` y
  `/transacciones`. **Base y comparación tienen que correr el mismo día** — si no, los «hoy» de la
  app difieren; para reproducir una base vieja, `--freeze` con la fecha que dice su manifest.
- **Calentamiento**: una visita a todas las rutas con sesión antes de capturar, sin capturar. Varias
  pantallas ESCRIBEN en el primer load (el aporte mensual de los holdings recurrentes, los snapshots
  del mes, el refresco de insights). Entre dos corridas seguidas el flujo libre del panel cambiaba
  en ₡970.680 solo por eso.
- **Barrido por pasos de una pantalla**, no un salto al final: los revelados por scroll usan
  `IntersectionObserver` con guarda de una sola vez, y de un salto hay secciones que nunca quedan en
  viewport lo suficiente. El hero del landing aparecía en una corrida y faltaba en la siguiente.
- **`document.fonts.ready`** antes de capturar: si no, una captura sale con la fuente de respaldo y
  la siguiente con la definitiva.
- **`document.getAnimations().forEach(a => a.finish())`**: `animations: "disabled"` del screenshot
  congela animaciones, no TRANSICIONES. `finish()` salta al estado final. Las infinitas lanzan
  `InvalidStateError`, así que esas se pausan en 0.
- **Flags de render** (`--disable-gpu`, `--disable-lcd-text`, `--force-color-profile=srgb`,
  `--font-render-hinting=none`, `--deterministic-mode`): rasterizado por software y antialiasing en
  gris. Sin ellos quedaban tiras de ±1 nivel en bordes de texto.

**`home` queda excluido de la comparación estricta**: la transición del hero no tiene un estado
final estable — deja ~200 px con delta ≤ 2 (invisible) que ni `finish()` cierra. Se sigue comparando
y reportando; revisar en la fase de motion. **No se baja el umbral** para taparlo: un `--threshold 2`
también escondería un cambio de color real de 1-2 niveles en cualquier pantalla, que es justo la
regresión que un refactor de tokens puede introducir.

## Ambiente: SIEMPRE el local, con la demo sembrada. Nunca producción.

La base y la comparación tienen que correr contra la misma base de datos y el mismo usuario: dos
corridas contra ambientes distintos difieren por los datos, no por el CSS, y el diff deja de
significar nada. Por eso la regla es fija, no una preferencia por corrida:

- **Ambiente**: Supabase local (`http://127.0.0.1:54321`), que es a donde apuntan `.env.local` y
  `.env.sandbox.local`. `.env.prod.local` apunta a producción y **no se usa para QA visual**.
- **Cuenta**: la demo **Familia Ramírez** (`information.theglowup@gmail.com`), sembrada en local.
  `demo@sandbox.local` (la del smoke E2E) existe pero va vacía: sirve para el smoke, no para una
  línea base — con ella casi todas las rutas capturan estados vacíos.
- **Levantar**, con Docker corriendo:

  ```bash
  export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"   # Node 22: supabase-js pide
                                                              # WebSocket nativo (Node 20 no lo trae)
  supabase start
  DEMO_ENV_FILE=.env.sandbox.local node scripts/demo/seed-demo-familia.mjs
  ```

  **`DEMO_ENV_FILE` nunca se omite**: sin esa variable el sembrador cae en su default,
  `.env.prod.local`, y **escribe en producción**. Verificá la primera línea que imprime —
  `objetivo: http://127.0.0.1:54321 (.env.sandbox.local)`— antes de dejarlo correr.

  `supabase db reset` **no** forma parte del flujo: la cadena de migraciones ya se aplica al
  levantar, y el reset borra toda la base local (incluidos los usuarios del simulador). El reset de
  CI existe para _probar_ que las migraciones aplican limpio en una base efímera, no como setup.

  El sembrador limpia y resiembra **solo** a José y Marta (`.in('user_id', [JOSE, MARTA])`), así que
  el resto de la base local queda intacto. Exige `plan: 'max'`: desde la migración
  `20260902120000_planes_tres_tiers_y_suscripcion.sql` el check de `profiles.plan` admite
  `('ninguno','esencial','pro','max')` y `premium` se renombró a `max`. Con un plan inválido la fila
  de `profiles` no se escribe, el usuario queda en `ninguno` y el muro del middleware manda a
  `/empezar?reanudar=1`: las 19 rutas con sesión capturarían esa pantalla en vez de la app.

**Qué registra el manifest** (`<out>/manifest.json`), además de ruta/ancho/tema/archivo: tiempo
hasta `networkidle`, errores de consola (`pageerror`), `termsModal` (el modal de Términos estaba
visible; el script **no** lo acepta nunca — aceptarlo es decisión de la persona dueña de la cuenta)
y `loadingResidual` (quedó un «Cargando…» visible tras scroll y 10 s de espera: hidratación
diferida de un límite `dynamic({ssr:false})`). Las dos son mediciones, no fallas del script.
