# Seguridad — Compound Ascend

Defensa en profundidad. **No afirmamos que la app sea "imposible de hackear".**
Documentamos controles y riesgos residuales.

## Controles implementados

| Área | Control |
|---|---|
| Autorización | RLS forzado en todas las tablas de datos; doble verificación (identidad + ownership) en servicios. |
| RLS tokens/plan | `ai_usage_ledger`/`ai_rate_limits` solo-lectura para el usuario; escritura solo service-role. `profiles.plan` protegido por trigger; no cambiable desde el cliente. |
| Secretos | Solo en env del backend; nunca `NEXT_PUBLIC_`; nunca en el repo; validación de env. |
| Validación | Zod en cliente y servidor; sanitización; queries parametrizados (supabase-js). |
| CORS | Allowlist por ambiente; sin wildcard en prod; origin-check en endpoints sensibles (IA, scanner, webhooks). |
| Rate limiting | Por IP y/o usuario; más estricto en auth, AI chat, receipt, market-data, reset. |
| Reset password | Respuesta genérica (no revela si el correo existe); enlaces con expiración (Supabase). |
| Errores | Sin stack traces al cliente; mensajes amables en español; Error Boundaries. |
| Cabeceras HTTP | CSP, HSTS (prod), X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy, COOP, CORP. |
| IA | Consumo server-side; límites por plan no manipulables; **toda acción requiere confirmación**; el prompt solo recibe contexto autorizado del propio usuario. |
| Webhooks | Verificación de firma HMAC en tiempo constante; cambios de plan solo por evento firmado. |
| Anti-clonación | CSP + CORS + origin checks + Turnstile (flujos de alto riesgo) + página de seguridad con dominios oficiales + recomendaciones SPF/DKIM/DMARC. |

## Acción requerida antes de producción

1. **Rotar** las API keys del handoff (Finnhub, AlphaVantage, Gemini): están comprometidas.
   _Al 2026-09-28: Finnhub **rotada** (y su literal retirado del prototipo público,
   `mobile-shell/design-prototipo/assets/invest.js`); falta confirmar AlphaVantage y Gemini._
2. Configurar `PAYMENT_WEBHOOK_SECRET`, `TURNSTILE_*` y dominios reales.
3. Configurar SPF/DKIM/DMARC del dominio de correo.
4. Verificar que el frontend de producción apunta al Supabase de producción.

## Riesgos residuales (documentados)

> **Estado verificado el 2026-09-28** (rama `chore/higiene-repo-publico`). Cada punto lleva
> su estado real hoy y el fichero que lo prueba. `[CERRADO]`/`[PARCIAL]`/`[ABIERTO]`.

- **[PARCIAL] Cache/rate-limit en memoria:** el **rate-limit ya es coherente entre
  instancias** vía Upstash Redis (INCR + PEXPIRE, con degradación a memoria si Redis falla)
  — `src/lib/rate-limit/index.ts` (`RedisRateStore`). Sigue **ABIERTO** el **cache de precios
  e indicadores económicos**, aún solo-memoria hasta enchufar el adaptador Redis —
  `src/lib/market-data/cache.ts`. El ledger de tokens sí es global (Postgres).
- **[ABIERTO] Incremento de `ai_usage_ledger`:** sigue siendo read-modify-write
  (`select tokens_used,requests` → `upsert`) con service-role — `src/lib/ai/usage.ts`. No hay
  RPC atómico (`increment`) todavía; bajo altísima concurrencia podría subcontar.
- **[ABIERTO] Tipos de BD:** `src/lib/supabase/database.types.ts` se mantiene a mano por fases
  (su propia cabecera lo dice); no se regenera automáticamente tras cada migración.
- **[ABIERTO] Precios de mercado:** Yahoo sigue en la cadena de respaldo con User-Agent
  spoofeado — `src/lib/market-data/providers.ts` (`yahoo()`, `yahooHistory()`). No es API
  oficial; conviene monitorear fallos por proveedor.
- **[ABIERTO] Vulnerabilidad transitiva `postcss`:** la dependencia directa está en `^8.5.15`
  con override `$postcss` — `package.json`. El bump a 8.5.28 está **pendiente** (rama Dependabot
  sin mergear); la transitiva interna de Next se resuelve al actualizar Next.
- **[ABIERTO] CSP con `'unsafe-inline'` (script-src/style-src):** sigue presente hoy —
  `src/lib/security/headers.ts` (líneas ~38 y ~53). La política aún permite scripts y estilos
  inline por el script anti-FOUC de tema y varios `dangerouslySetInnerHTML` controlados.
  Endurecer a nonces/hashes queda **pendiente como P2 dedicado**. Mitigado por `object-src
  'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'` y los origin-checks.

## Pruebas de seguridad

- `tests/rls/` — aislamiento entre usuarios, inmutabilidad de tokens/límites,
  bloqueo de cambio de plan, anon sin acceso (se ejecutan con un Supabase de prueba).
- `tests/unit/` — confirmación de acciones IA, límites de tokens, validaciones.
