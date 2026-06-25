# Pruebas de carga (k6)

Scripts de carga para Compound Ascend. **Correr SIEMPRE contra un entorno de
prueba/efímero, NUNCA contra producción real**: consume recursos y dispara los
rate-limits de usuarios reales.

## Instalar k6

- macOS: `brew install k6`
- Otros sistemas: https://k6.io/docs/get-started/installation/

## Correr

Smoke (humo, poca carga, valida que responde):

```bash
BASE_URL=http://localhost:3000 k6 run scripts/k6/smoke.js
```

Carga con rampa (sube a 50 VUs y baja):

```bash
BASE_URL=https://<tu-staging>.vercel.app k6 run scripts/k6/load.js
```

Variables disponibles: `BASE_URL`, `VUS`, `VUS_PEAK`, `DURATION`, `RAMP_UP`,
`SUSTAIN`, `RAMP_DOWN`.

## Flujos autenticados (plantilla)

`/api/health` es público. Para medir rutas autenticadas (p. ej. `/api/investments/portfolio`),
pasa una cookie de sesión de Supabase válida de un **usuario de prueba** por env y
añádela a las requests:

```bash
COOKIE="sb-access-token=...; sb-refresh-token=..." \
BASE_URL=https://<staging>.vercel.app k6 run scripts/k6/load.js
```

y en el script: `http.get(url, { headers: { Cookie: __ENV.COOKIE } })`.
**No commitees tokens ni cookies reales.**

## Qué observar

- `http_req_duration` p(95): latencia bajo carga.
- Tasa de `429` (`rate_limited_429`): el rate-limit entrando bajo carga (esperado).
- Errores `5xx`: no deberían aparecer; si aparecen, investigar antes de escalar.

## Notas

- Medir **después** de tener Redis activo (Upstash) para que el rate-limit sea
  coherente entre instancias; si no, los límites son por-lambda y los números
  engañan.
- Empezar suave (smoke) y subir gradualmente; revisar el dashboard de Vercel y
  Supabase en paralelo.
