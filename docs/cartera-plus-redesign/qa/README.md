# QA visual — línea base y diff

1. **Servidor de producción** (nunca `next dev`: StrictMode corre los efectos dos veces y las
   animaciones por scroll no llegan a verse): `npm run build && npm run start -- -p 3001`.
2. **Línea base**: `E2E_EMAIL=… E2E_PASSWORD=… npm run qa:snap -- --out qa-snapshots/base`
   (23 rutas × 3 anchos × 2 temas; `--theme`, `--widths` y `--base-url` ajustan el alcance).
3. **Tras el cambio**: `… npm run qa:snap -- --out qa-snapshots/cambio`.
4. **Comparar**: `npm run qa:diff -- --a qa-snapshots/base --b qa-snapshots/cambio` — imprime
   píxeles distintos por imagen, escribe los PNG de diferencias y sale con 1 si alguna supera
   `--max-diff-pixels` (default 0).

## Ambiente: SIEMPRE el local, con la cuenta sandbox. Nunca producción.

La base y la comparación tienen que correr contra la misma base de datos y el mismo usuario: dos
corridas contra ambientes distintos difieren por los datos, no por el CSS, y el diff deja de
significar nada. Por eso la regla es fija, no una preferencia por corrida:

- **Ambiente**: Supabase local (`http://127.0.0.1:54321`), que es a donde apuntan `.env.local` y
  `.env.sandbox.local`. `.env.prod.local` apunta a producción y **no se usa para QA visual**.
- **Cuenta**: la sandbox del smoke E2E — `demo@sandbox.local` (`tests/e2e/smoke.spec.ts`).
- **Levantar**, con Docker corriendo y el mismo flujo que usa CI (`.github/workflows/ci.yml`):

  ```bash
  supabase start                 # arranca el stack aplicando migraciones
  supabase db reset              # re-apply limpio de toda la cadena
  supabase status -o env         # de ahí salen API_URL / ANON_KEY / SERVICE_ROLE_KEY
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… E2E_EMAIL=demo@sandbox.local E2E_PASSWORD=… \
    node scripts/seed-e2e-user.mjs
  ```

  El seeder crea el usuario; los datos de la cuenta demo se siembran aparte (`scripts/demo/`).
  Una base recién reseteada deja muchas pantallas en estado vacío: anotá en el PR cuántas rutas
  quedaron así, porque una base poco poblada es una línea base poco representativa.

**Qué registra el manifest** (`<out>/manifest.json`), además de ruta/ancho/tema/archivo: tiempo
hasta `networkidle`, errores de consola (`pageerror`), `termsModal` (el modal de Términos estaba
visible; el script **no** lo acepta nunca — aceptarlo es decisión de la persona dueña de la cuenta)
y `loadingResidual` (quedó un «Cargando…» visible tras scroll y 10 s de espera: hidratación
diferida de un límite `dynamic({ssr:false})`). Las dos son mediciones, no fallas del script.
