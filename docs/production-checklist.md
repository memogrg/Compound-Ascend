# Checklist de producción — Compound Ascend

Estado de los 14 puntos del pre-deployment checklist.

| # | Requisito | Estado | Dónde |
|---|---|---|---|
| 1 | Authorization (solo datos propios, validación backend, RLS, tests) | ✅ | `database/migrations`, `tests/rls` |
| 2 | Sanitization & Validation (Zod front/back, querys parametrizados) | ✅ | `*/schemas.ts`, supabase-js |
| 3 | CORS por ambiente, sin wildcard en prod | ✅ | `src/lib/security/cors.ts` |
| 4 | Rate limiting (más estricto en auth/IA/scanner/market/reset) | ✅ | `src/lib/rate-limit` |
| 5 | Password reset con expiración, sin revelar existencia de cuenta | ✅ | `src/lib/auth/actions.ts` |
| 6 | Errores sin stack traces; mensajes amigables; error boundaries | ✅ | `src/lib/errors.ts`, `app/error.tsx` |
| 7 | Índices de BD (user_id, household_id, fechas, mes, category, símbolo…) | ✅ | migraciones + `apply_user_data_policies` |
| 8 | Logging estructurado, audit/security, alertas | ✅ | `src/lib/logger.ts`, `src/server/observability/alerts.ts`, tablas de auditoría |
| 9 | Deployments con rollback, staging/prod, validación de env, migraciones | ✅ | `docs/deploy.md`, `src/lib/env.ts` |
| 10 | RLS para tokens/límites (no modificables por el usuario) | ✅ | `0008_ai.sql`, `tests/rls` |
| 11 | Tablas de usuarios y tokens; agregación server-side | ✅ | `0002`, `0008`, `src/lib/ai/usage.ts` |
| 12 | Lock down CORS por ambiente | ✅ | `ALLOWED_ORIGINS` + `cors.ts` |
| 13 | HTTP security headers | ✅ | `src/lib/security/headers.ts` |
| 14 | Anti-clonación/impersonación (CSP, origin checks, Turnstile, webhooks firmados, SPF/DKIM/DMARC) | ✅ código / ⚠️ configurar dominios y DNS | `headers.ts`, `cors.ts`, `webhook.ts`, `docs/security.md` |

## Acciones manuales pendientes (infra)

- [ ] Rotar las 3 API keys comprometidas del handoff.
- [ ] Provisionar Supabase (staging + prod), aplicar migraciones y seed.
- [ ] Configurar Google OAuth y URLs de callback.
- [ ] Configurar `ALLOWED_ORIGINS`, `PAYMENT_WEBHOOK_SECRET`, Turnstile.
- [ ] Configurar SPF/DKIM/DMARC del dominio de correo.
- [ ] (Escala) Integrar Redis para rate-limit y cache de precios globales.
- [ ] (Exactitud) `supabase gen types typescript` tras provisionar.
