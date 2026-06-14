# Plan de monitoreo — Sentry (propuesta, requiere tu OK)

> Hoy NO hay observabilidad de errores en runtime: si algo falla en producción,
> nadie se entera salvo que el usuario lo reporte. Sentry cierra ese hueco.
> **No instalo nada sin tu aprobación**; las variables las creas tú en Vercel.

## Qué instalaría

- Paquete: `@sentry/nextjs` (integración oficial App Router).
- Archivos nuevos:
  - `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
  - `instrumentation.ts` (hook de Next 15)
  - ajuste menor en `next.config.ts` (envolver con `withSentryConfig`)
- `global-error.tsx` ya existe → se le añade `Sentry.captureException`.

## Configuración conservadora propuesta

- `tracesSampleRate: 0.1` (10% de transacciones — suficiente para detectar
  patrones sin coste alto).
- `replaysSessionSampleRate: 0` + `replaysOnErrorSampleRate: 1.0` (session
  replay SOLO cuando hay error — barato y útil para depurar).
- **PII**: `sendDefaultPii: false`. Scrubbing extra de montos/emails en
  `beforeSend` (esta app maneja datos financieros — nada de importes ni correos
  en los eventos).
- `ignoreErrors` para ruido conocido (NEXT_REDIRECT, abortos de navegación).

## Variables de entorno (las creas tú en Vercel, yo nunca escribo sus valores)

- `NEXT_PUBLIC_SENTRY_DSN` — DSN del proyecto Sentry.
- `SENTRY_AUTH_TOKEN` — para subir source maps en el build (solo CI/Vercel).
- `SENTRY_ORG`, `SENTRY_PROJECT`.

## Alternativa / complemento

- **PostHog** (analítica de producto: embudos, retención) — opcional, decides
  tú. Sentry cubre errores; PostHog cubre comportamiento. No son lo mismo.

## Cómo proceder si apruebas

1. Tú creas el proyecto en sentry.io y pones las 4 variables en Vercel.
2. Yo instalo el paquete + configs + scrubbing en una rama `feat/sentry`,
   gate completo, PR.
3. Verificamos en el preview que un error de prueba llega a Sentry sin PII.


---

## Estado: IMPLEMENTADO (dormante) — rama feat/sentry-observability

Integración instalada y commiteada, **inerte mientras no exista
`NEXT_PUBLIC_SENTRY_DSN`** (el SDK no envía nada y el build no se afecta —
verificado: build exit 0 sin DSN).

Archivos: `sentry.server.config.ts`, `sentry.edge.config.ts`,
`src/instrumentation-client.ts`, `src/instrumentation.ts`,
`src/lib/observability/sentry-options.ts` (opciones + scrubbing PII),
`global-error.tsx` (captureException), `next.config.ts` (withSentryConfig).

### Para activarlo (solo tú)
1. Crear proyecto en sentry.io (Next.js).
2. En Vercel añadir variables: `NEXT_PUBLIC_SENTRY_DSN` (obligatoria),
   y para subir source maps en el build: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
   `SENTRY_PROJECT` (opcionales — sin ellas igual reporta, solo sin
   stack traces des-minificados).
3. Re-deploy. Verás los errores en Sentry; el scrubbing quita correos/montos.
