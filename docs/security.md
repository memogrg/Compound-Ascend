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
2. Configurar `PAYMENT_WEBHOOK_SECRET`, `TURNSTILE_*` y dominios reales.
3. Configurar SPF/DKIM/DMARC del dominio de correo.
4. Verificar que el frontend de producción apunta al Supabase de producción.

## Riesgos residuales (documentados)

- **Cache/rate-limit en memoria:** hoy por instancia. Con múltiples instancias, el
  rate-limit y el cache de precios no son globales hasta integrar Redis
  (interfaz ya preparada). El ledger de tokens sí es global (Postgres).
- **Incremento de `ai_usage_ledger`:** hoy es read-modify-write con service-role;
  bajo altísima concurrencia podría subcontar. Mitigación futura: función RPC
  atómica (`increment`) en Postgres.
- **Tipos de BD:** mantenidos a mano por fase; regenerar con `supabase gen types`
  tras provisionar para garantizar exactitud total.
- **Precios de mercado:** Yahoo no es API oficial (UA spoof); puede cambiar. Hay
  cadena de respaldo, pero conviene monitorear fallos por proveedor.
- **Vulnerabilidad transitiva:** `postcss` interno de Next (moderada) — se resuelve
  al actualizar Next; nuestra dependencia directa de postcss está parcheada.

## Pruebas de seguridad

- `tests/rls/` — aislamiento entre usuarios, inmutabilidad de tokens/límites,
  bloqueo de cambio de plan, anon sin acceso (se ejecutan con un Supabase de prueba).
- `tests/unit/` — confirmación de acciones IA, límites de tokens, validaciones.
