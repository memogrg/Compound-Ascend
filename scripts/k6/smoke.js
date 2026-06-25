import http from "k6/http";
import { check, sleep } from "k6";

/**
 * Smoke test: verifica que /api/health responde 200 con poca carga.
 * Endpoint público (rate-limited). NO correr contra producción real.
 *
 *   BASE_URL=http://localhost:3000 k6 run scripts/k6/smoke.js
 */
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  vus: Number(__ENV.VUS || 3),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    "status 200": (r) => r.status === 200,
    "cuerpo status=ok": (r) => r.json("status") === "ok",
  });
  sleep(1);
}
