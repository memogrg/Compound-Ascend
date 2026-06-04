# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Next.js 15)
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript strict check
npm run format       # Prettier
npm run test         # Vitest (unit tests, run once)
npm run test:watch   # Vitest in watch mode
```

To run a single test file:
```bash
npx vitest run tests/unit/control.test.ts
```

The RLS isolation test (`tests/rls/isolation.test.ts`) requires real Supabase credentials and is skipped in CI unless those env vars are set.

## Architecture

**Compound Ascend** is a Spanish-language personal finance AI app built as a Next.js 15 monolith (App Router + React Server Components). Supabase handles auth, Postgres, and RLS. Gemini is the AI backend.

### Module structure

Business logic lives in `src/modules/`, divided into 6 self-contained modules:

| Module | Route | Purpose |
|---|---|---|
| `personal-profile` | `/mi-perfil-financiero` | Financial DNA onboarding wizard |
| `financial-base` | `/mi-base-financiera` | Income/expense tracking |
| `dashboard` | `/dashboard` | Financial health overview |
| `control` | `/control-financiero` | Priority Engine (debt strategy) |
| `wealth` | `/patrimonio` | Investments & insurance |
| `rich-life` | `/mi-rich-life` | Net worth & Rich Life Score |
| `assistant` | API only | AI chat + receipt scanner |

Each module follows this internal layout:
```
module/
  api/actions.ts      # Server Actions (mutations)
  components/         # React components
  services/           # Data fetching & business logic
  engine/             # Pure computation algorithms
  schemas.ts          # Zod validation
  types.ts            # TypeScript interfaces
  index.ts            # Public barrel export
```

**Always import from `module/index.ts`, never from internal files directly.**

### Data flow

1. Client component triggers Server Action (`"use server"` in `api/actions.ts`)
2. Action validates with Zod, calls `requireUser()` for auth
3. Supabase RLS enforces row-level ownership — no manual user-ID filtering needed
4. `revalidatePath()` triggers re-render; no client-side cache invalidation

### Supabase clients

Three clients with different privilege levels — use the right one:
- `src/lib/supabase/browser.ts` — client components only
- `src/lib/supabase/server.ts` — server components and actions (cookie-based session)
- `src/lib/supabase/service.ts` — admin-only (bypasses RLS; only for webhooks/alerts)

`getUser()` validates session; `requireUser()` throws if unauthenticated.

### AI layer

`src/lib/ai/provider.ts` defines the `AIProvider` interface — Gemini is the real implementation; `StubProvider` is used in tests. The orchestrator in `src/modules/assistant/` builds a Spanish-language system prompt with the user's financial context. AI responses return text + a proposed action object; actions are **never auto-executed** — they're surfaced for user confirmation.

### Market data

`src/lib/market-data/` tries providers in fallback sequence:
- Stocks/ETF: Finnhub → AlphaVantage → Yahoo Finance
- Crypto: Binance → CoinGecko

Timeout is 6 s per provider; in-memory caching is used (Redis is planned but not yet wired up, so multi-instance deployments share no cache).

### Rate limiting

`src/lib/rate-limit/` is in-memory, keyed by user ID or IP. Same caveat: no Redis backing yet, so limits are per-instance. Don't add new in-memory global state — surface the Redis hook when you need persistence.

### Security constraints

- **RLS is the authorization layer.** Every user-data table has RLS policies; the service-role client bypasses them — never use it for user-initiated requests.
- Tables `ai_usage_ledger`, `ai_rate_limits`, `audit_logs`, and `security_events` are service-role-only; they cannot be written by the Supabase anon key.
- `profiles.plan` is protected by a Postgres trigger — only the service role can change it.
- CORS is enforced in route handlers via `src/lib/security/` helpers.
- Payment webhooks are verified via HMAC signature before any state change.

### TypeScript conventions

- `@/*` maps to `src/*`
- `noUncheckedIndexedAccess` is on — index into arrays/objects defensively
- `noUnusedLocals` and `noUnusedParameters` are errors — prefix intentionally unused params with `_`
- Database types are generated from Supabase; don't hand-write table shapes

### Investment engine (migration 0011)

Three new tables: `dividends`, `portfolio_snapshots` (both new), and `investment_holdings` extended with `average_cost`, `purchase_date`, `broker`, `currency`.

Key new files:
- `src/modules/wealth/engine/portfolio-engine.ts` — pure engine: holding performance, portfolio analytics, dividend analytics, crypto analytics, growth score, AI insight builders
- `src/modules/wealth/services/holdings-service.ts` — CRUD for `investment_holdings`
- `src/modules/wealth/services/dividend-service.ts` — CRUD for `dividends`
- `src/modules/wealth/services/portfolio-service.ts` — analytics orchestrator (fetches prices, normalizes currencies, runs engines)
- `src/modules/wealth/services/snapshot-service.ts` — `getSnapshotHistory(period)`, `generateAndSaveSnapshot()`
- `src/modules/wealth/services/investment-insights.ts` — deterministic Spanish insight strings (no AI calls)
- `src/lib/market-data/persist.ts` — fire-and-forget DB write to `market_price_cache` after each live price fetch

Server actions for holdings and dividends are in `src/modules/wealth/api/actions.ts`.

API routes:
- `GET /api/investments/portfolio` — full analytics + snapshots + insights (authenticated, rate-limited)
- `POST /api/investments/snapshot` — generate today's snapshot; accepts `X-Cron-Secret` header for unattended cron calls (add `CRON_SECRET` env var)

**Net worth integration**: `rich-life-service.ts` now calls `getPortfolioMarketValues()` to use live market prices (`quantity × current_price`) instead of static `invested_amount` for investment assets.

**Health score**: `computeHealthScore()` now accepts an optional `investmentRate` param that adds up to +5 pts bonus (capped at 100). No new bar in the UI.

**AI context**: `FinancialContext` now includes `portfolioValue`, `portfolioReturnPct`, `topAssetClass`; the chat route enriches these from `getPortfolioReport()`.

**Currency discipline**: all amounts in portfolio engines are assumed to be in the user's primary currency. Conversion from holding/price currencies happens in `portfolio-service.ts` before calling the engines.

### Localisation

All user-facing text, UI copy, AI prompts, and error messages are in **Spanish**. Code identifiers, comments, and this file are in English.
