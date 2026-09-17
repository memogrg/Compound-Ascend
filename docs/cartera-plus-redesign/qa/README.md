# QA visual — línea base y diff

1. **Servidor de producción** (nunca `next dev`: StrictMode corre los efectos dos veces y las
   animaciones por scroll no llegan a verse): `npm run build && npm run start -- -p 3001`.
2. **Línea base**: `E2E_EMAIL=information.theglowup@gmail.com E2E_PASSWORD=… npm run qa:snap -- --out qa-snapshots/base`
   (23 rutas × 3 anchos × 2 temas; `--theme`, `--widths` y `--base-url` ajustan el alcance).
3. **Tras el cambio**: `… npm run qa:snap -- --out qa-snapshots/cambio`.
4. **Comparar**: `npm run qa:diff -- --a qa-snapshots/base --b qa-snapshots/cambio` — imprime
   píxeles distintos por imagen, escribe los PNG de diferencias y sale con 1 si alguna supera
   `--max-diff-pixels` (default 0).

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
