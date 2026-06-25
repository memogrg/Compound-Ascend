import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

/**
 * Prueba de carga con rampa sobre /api/health.
 *
 * OJO: el endpoint está rate-limited; bajo carga es ESPERADO observar 429
 * (eso valida que el rate-limit entra). NUNCA correr contra producción real:
 * usar un entorno de staging/efímero.
 *
 *   BASE_URL=https://<staging>.vercel.app k6 run scripts/k6/load.js
 */
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const rateLimited = new Rate("rate_limited_429");

export const options = {
  stages: [
    { duration: __ENV.RAMP_UP || "30s", target: Number(__ENV.VUS || 20) },
    { duration: __ENV.SUSTAIN || "1m", target: Number(__ENV.VUS_PEAK || 50) },
    { duration: __ENV.RAMP_DOWN || "30s", target: 0 },
  ],
  thresholds: {
    // Latencia bajo carga; los 429 no cuentan como fallo de servidor.
    http_req_duration: ["p(95)<1200"],
  },
};

export default function () {
  // Para rutas autenticadas, pasa una cookie de sesión de prueba por env:
  //   const params = { headers: { Cookie: __ENV.COOKIE } };
  const res = http.get(`${BASE_URL}/api/health`);
  rateLimited.add(res.status === 429);
  check(res, {
    "servido (200 o 429)": (r) => r.status === 200 || r.status === 429,
    "sin 5xx": (r) => r.status < 500,
  });
}
