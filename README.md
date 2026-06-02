# Compound Ascend

Asesor financiero personal con IA, en español. Web app responsiva (desktop, tablet, móvil) construida como **monolito modular** sobre Next.js + Supabase.

Cinco módulos encadenados (la "escalera financiera"):

1. **Mi Perfil Financiero** — tu ADN financiero (onboarding conversacional).
2. **Mi Base Financiera** — radiografía mensualizada de ingresos y gastos.
3. **Control Financiero** — Motor de Prioridad: objetivos y deudas.
4. **Patrimonio** — crecimiento (inversiones) y protección (seguros).
5. **Mi Rich Life** — patrimonio neto y Rich Life Score en el tiempo.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Supabase (Postgres + Auth + Storage, RLS) · IA tras capa `AIProvider` (Gemini) · Recharts · Zod · Redis/memoria.

## Requisitos

- Node.js >= 20

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # rellena tus variables (sin commitearlas)
npm run dev
```

App en `http://localhost:3000`.

> ⚠️ **Seguridad:** las API keys que llegaron en el handoff (Finnhub, AlphaVantage, Gemini) se consideran **comprometidas**. Genera nuevas antes de usar la app. Las claves van solo en variables de entorno del backend; nunca con prefijo `NEXT_PUBLIC_` ni en el repositorio.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | Comprobación de tipos (TS strict) |
| `npm run lint` | ESLint |
| `npm run test` | Tests (Vitest) |
| `npm run format` | Prettier |

## Estado del proyecto

**Todas las fases (F0–F10) completas.** Los 5 módulos, el dashboard, la API de
precios, el asistente IA, la monetización y el hardening están implementados y
verificados (typecheck/lint/tests/build en verde). Ver
[`docs/readiness-report.md`](docs/readiness-report.md).

| Fase | Módulo |
|---|---|
| F0 | Fundaciones (shell, seguridad, design system) |
| F1 | Auth + base de datos (45 tablas, RLS, seeds) |
| F2 | Mi Perfil Financiero (Setup Wizard) |
| F3 | Mi Base Financiera (mensualización) |
| F4 | Dashboard (salud financiera) |
| F5 | Control Financiero (Motor de Prioridad) |
| F6 | Patrimonio + Market API |
| F7 | Mi Rich Life (board report) |
| F8 | IA (chat 2 modos + receipt scanner) |
| F9 | Monetización (planes, gating, webhook firmado) |
| F10 | Hardening, observabilidad, docs |

Documentación: [`docs/deploy.md`](docs/deploy.md) ·
[`docs/security.md`](docs/security.md) ·
[`docs/production-checklist.md`](docs/production-checklist.md) ·
[`docs/readiness-report.md`](docs/readiness-report.md)

**Pendiente (infra, no código):** provisionar Supabase + migraciones, rotar las
API keys comprometidas del handoff, configurar dominios/secretos por ambiente.
