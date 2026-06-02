# Despliegue — Compound Ascend

## Ambientes

| Ambiente | `APP_ENV` | Dominio | Notas |
|---|---|---|---|
| Desarrollo | `development` | localhost:3000 | CORS abre localhost; CSP permite HMR |
| Staging | `staging` | staging.tu-dominio | Solo dominio staging en `ALLOWED_ORIGINS` |
| Producción | `production` | tu-dominio | HSTS activo; CSP estricta; sin wildcard CORS |

## Variables de entorno

Ver `.env.example`. Validadas con Zod (`src/lib/env.ts`) de forma *lazy* y fail-fast:
si falta una crítica, la ruta que la usa falla con un error claro en el servidor
(no expone secretos).

**Reglas:**
- Las keys de backend **nunca** llevan prefijo `NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `FINNHUB_TOKEN`, `ALPHA_VANTAGE_KEY`,
  `PAYMENT_WEBHOOK_SECRET` son secretos del servidor.
- ⚠️ Las keys del handoff inicial están **comprometidas**: genera nuevas antes de
  desplegar.

## Base de datos (Supabase)

1. Crear proyecto Supabase (staging y production separados).
2. Aplicar migraciones **en orden** (ver `database/README.md`):
   `database/migrations/0001 … 0010`.
3. Cargar `database/seed/seed.sql`.
4. Habilitar Google en Supabase Auth → Providers; añadir la URL de callback
   `<APP_URL>/auth/callback`.
5. (Opcional) `supabase gen types typescript` para regenerar
   `src/lib/supabase/database.types.ts` con los tipos exactos.

## Build y arranque

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run build
npm run start   # producción
```

## Deploy en Vercel (recomendado)

1. Importar el repo en Vercel.
2. Configurar las env vars por ambiente (Production / Preview).
3. Cada push a `main` → producción; PRs → preview (staging-like).
4. Configurar `ALLOWED_ORIGINS` con el dominio real por ambiente.

## Rollback

- **Código:** Vercel mantiene deployments inmutables → *Promote* un deployment
  anterior, o `git revert` + push.
- **Base de datos:** las migraciones son aditivas y versionadas. Para revertir un
  cambio, escribe una **nueva** migración de reversión (no edites las aplicadas).
  Haz respaldo (`pg_dump`) antes de migraciones destructivas.
- **Plan/monetización:** los cambios de plan solo ocurren por webhook firmado;
  un evento erróneo se corrige con otro evento `plan.updated`.

## Cron / jobs futuros

`monthly_snapshots`, `net_worth_snapshots` y `rich_life_scores` se pueden
materializar con un cron mensual (Vercel Cron / Supabase scheduled functions)
que llame a los servicios de cada módulo. Hoy se calculan on-demand.
