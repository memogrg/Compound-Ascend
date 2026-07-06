# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Next.js 15)
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript strict check
npm run format       # Prettier
npm run test         # Vitest (unit + integration, run once)
npm run test:watch   # Vitest in watch mode
npm run test:eval    # Advisor eval suite (tests/evals) — gated on AI credentials
```

To run a single test file:
```bash
npx vitest run tests/unit/control.test.ts
```

The E2E smoke test is Playwright, not Vitest: `npx playwright test tests/e2e/smoke.spec.ts`. Its `webServer` config boots `npm run dev` (reusing an existing server) and needs `E2E_EMAIL`/`E2E_PASSWORD` for a seeded sandbox user. In CI it's a non-blocking job that seeds the user + a holding via service-role SQL before running.

Test layout: `tests/unit` (pure logic), `tests/rls` (real-Supabase RLS isolation — skipped in CI unless creds are set), `tests/evals` (advisor quality, some live AI), `tests/e2e` (Playwright smoke), `tests/stubs` (e.g. a `server-only` no-op aliased in `vitest.config.ts` so server modules import in the node test env). `npm run test` matches `*.test.ts` everywhere, so eval files run too but self-skip without AI credentials.

## Architecture

**Compound Ascend** is a Spanish-language personal finance AI app built as a Next.js 15 monolith (App Router + React Server Components). Supabase handles auth, Postgres, and RLS. Gemini is the AI backend.

### Module structure

Business logic lives in `src/modules/`, divided into 8 self-contained modules:

| Module | Routes | Purpose |
|---|---|---|
| `personal-profile` | `/mi-perfil-financiero` | Financial DNA onboarding wizard |
| `financial-base` | `/mi-base-financiera`, `/gastos`, `/ingresos`, `/transacciones` | Budget + income/expense tracking (each tab is its own route) |
| `dashboard` | `/dashboard` | Financial health overview |
| `control` | `/control-financiero` (Ahorro), `/deudas` | Priority Engine, goals, debt strategy |
| `wealth` | `/patrimonio`, `/patrimonio/proteccion`, `/patrimonio/indicadores` | Investments & insurance |
| `rich-life` | `/mi-rich-life` | Net worth & Rich Life Score |
| `account` | `/configuracion` | Account, plan, household invitations, WhatsApp link |
| `assistant` | API only | AI chat + receipt scanner |

WhatsApp lives outside modules (`src/lib/whatsapp/` + `/api/whatsapp/webhook`); household helpers in `src/lib/household/`. The messaging provider is abstracted behind `WhatsAppProvider` (`provider.ts`): **Meta WhatsApp Cloud API** (`meta.ts`) is the active provider for both inbound (webhook verifies `X-Hub-Signature-256` via `meta-signature.ts`) and outbound. The legacy Twilio implementation (`twilio.ts` / `twilio-signature.ts`) is retained only as a rollback path and is no longer wired into the webhook — see issue #114 for its removal.

Email receipt ingestion is a second external-input path (`src/lib/ingestion/`): an IMAP poller (`ingestion/email/imap-poller.ts`) parses forwarded bank/card emails into `ingest_proposals` the user reviews. Like the WhatsApp webhook it has no user session, so it writes with the **service-role** client and its rows surface for categorisation rather than being auto-applied.

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

### Linked transactions (orchestrator)

A money event is a single fact: when control/wealth record a payment, dividend, rent, goal contribution/withdrawal or holding purchase/sale, the transaction (`linked_kind`/`linked_id` on `transactions`) and the specialized ledger row are created together via `financial-base/services/linked-transaction-service.ts`, with compensating rollback if the second write fails. Dependency direction: control/wealth → financial-base, never the reverse. Budget lines derived from entities (`budget_items.source_kind` ≠ `'manual'`) are locked in the UI and regenerate through `syncDerivedBudget`; edit them in their owning module. Reconciliation (`engine/reconciliation.ts`) surfaces unlinked transactions whose category has a `linked_kind` and lets the user link them 1-tap.

### Household

Every INSERT into user-data tables must include `household_id` via `getActiveHouseholdId()` (`src/lib/household/active.ts`) — otherwise the row is invisible to the rest of the household (RLS filters by it). There's a guard test in `tests/unit/household-propagation.test.ts`. WhatsApp writes use the service-role client directly (the webhook has no user session) and bypass the central pipeline; its transactions are born `linked_kind='none'` and surface in reconciliation once the user categorizes them.

### Supabase clients

Three clients with different privilege levels — use the right one:
- `src/lib/supabase/browser.ts` — client components only
- `src/lib/supabase/server.ts` — server components and actions (cookie-based session)
- `src/lib/supabase/service.ts` — admin-only (bypasses RLS; only for webhooks/alerts)

`getUser()` validates session; `requireUser()` throws if unauthenticated.

### AI layer

`src/lib/ai/provider.ts` defines the `AIProvider` interface — Gemini is the real implementation (`GEMINI_MODEL`, default `gemini-3.5-flash`; vision uses `gemini-2.5-flash`); `StubProvider` is used in tests. The orchestrator in `src/modules/assistant/` builds a Spanish-language system prompt with the user's financial context. AI responses return text + a proposed action object; actions are **never auto-executed** — they're surfaced for user confirmation.

### Insights (the bell / campana)

`src/lib/insights/` powers the dashboard notification bell. Pure `detect*` functions in `detectors.ts` each turn some slice of user data into `DetectedInsight`s (kind + severity + optional `relatedKind`/`relatedId`). `refreshInsights()` runs them behind a **freshness guard** (only if the last run is stale) and hands the result to `syncInsights()`, which **reconciles by `(kind, related_id)`**: a detector that stops emitting an insight marks the persisted row `resuelto` automatically — this is how an insight self-clears once the underlying condition is fixed. `getActiveInsights()` triggers a refresh on read. Keep side-effectful work (merges, expense writes) **out of `refreshInsights()`** — it also runs from the AI context-engine; do such work in the page load instead (see the DCA gap below).

### DCA gap (brecha de aporte) — cross-module example

A worked example of the patterns above. Recurring quoted holdings (`is_recurring`, `monthly_contribution > 0`) auto-register a monthly contribution at the live price when Patrimonio **or** the dashboard loads (`ensureMonthlyContributions()`, best-effort, idempotent via a unique index on `(holding_id, period_year, period_month)`). Each contribution row (`holding_contributions`) links to its expense `transaction_id`; the user confirms/adjusts the price (`adjustContributionPrice`, reverse + re-merge — the weighted average is order-independent). Open contributions surface as an `aporte_pendiente` insight that self-resolves on confirmation. Every purchase is also persisted to `investment_transactions` (`tx_type='compra'`, with `holding_id`) for DCA history — the holding's running average is unchanged by this, it's history only.

### Market data

`src/lib/market-data/` tries providers in fallback sequence:
- Stocks/ETF: Finnhub → AlphaVantage → Yahoo Finance
- Crypto: Binance → CoinGecko

Timeout is 3 s per provider for price lookups (`providers.ts`); FX-rate fetches (`fx-rates.ts`) use 6 s. In-memory caching is used (Redis is planned but not yet wired up for market data, so multi-instance deployments share no cache).

### Rate limiting

`src/lib/rate-limit/` uses a fixed-window counter behind a `RateStore` abstraction: **Upstash Redis** (`RedisRateStore`, INCR + PEXPIRE) when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set — coherent across Vercel's serverless instances — else an in-memory fallback (`MemoryRateStore`). Redis failures at runtime degrade to memory (fail-open, logged). Buckets are declared in `RATE_LIMITS` (auth, aiChat, receiptScan, marketData, passwordReset, webhook). Note the split: rate-limit is Redis-backed, but the **market-data and economic-indicators caches (`*/cache.ts`) are still memory-only** even when `REDIS_URL` is present — they log and use the in-memory TTL store until a Redis adapter is wired.

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

### Gastos tab (frascos/sobres)

The expense panel renders jars (`financial-base/components/v2/expense-jars/` + pure engine `engine/expense-jars.ts`): 6 normal groups with envelopes (favorite leaf categories) and 4 linked groups fed by real entities (holdings/debts/policies/goals) with deep-link CTAs (`?new=holding|debt|policy|goal`). Budget edits for the current period go through a 3-check warning modal. Suggestion chips merge `engine/expense-suggestions.ts` benchmarks with non-favorite system leaves.

### Gotchas

- `next lint` is deprecated (removal in Next.js 16) — migration to ESLint CLI pending.
- Some `revalidatePath("/ahorro")` calls reference a non-existent route; the savings screen is `/control-financiero`.
- Migrations: ~76 files in `supabase/migrations/`, hand-numbered `YYYYMMDD######`. Numbering has intentional gaps (skipped/renamed versions) — e.g. `20260610000001-3` (household) and `20260610100001-3` (interconexión, renamed to avoid a version collision) coexist on purpose; don't "fix" the numbering. Migrations are applied **manually** (SQL Editor), then reconciled with `supabase migration repair --status applied <version>` — not `supabase db push`. Adding a column to a table means the generated `src/lib/supabase/database.types.ts` won't know about it (types aren't auto-regenerated), so add the field to the relevant `*Row` type in the same change or inserts/updates won't typecheck.
- `npm run build` and `npm run dev` can't run simultaneously (shared `.next`).

### Localisation

All user-facing text, UI copy, AI prompts, and error messages are in **Spanish**. Code identifiers, comments, and this file are in English.
