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
| `account` | `/configuracion` | Account, plan, household invitations |
| `assistant` | API only | AI chat + receipt scanner |

Household helpers live in `src/lib/household/`. Gasto logging and the advisor conversation live in the web and mobile apps.

Email receipt ingestion is the app's external, session-less input path (`src/lib/ingestion/`): an IMAP poller (`ingestion/email/imap-poller.ts`) parses forwarded bank/card emails into `ingest_proposals` the user reviews. It has no user session, so it writes with the **service-role** client and its rows surface for categorisation rather than being auto-applied.

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

Every INSERT into user-data tables must include `household_id` via `getActiveHouseholdId()` (`src/lib/household/active.ts`) — otherwise the row is invisible to the rest of the household (RLS filters by it). There's a guard test in `tests/unit/household-propagation.test.ts`. Email-ingestion writes use the service-role client directly (no user session) and bypass the central pipeline; its transactions are born `linked_kind='none'` and surface in reconciliation once the user categorizes them.

### Supabase clients

Three clients with different privilege levels — use the right one:
- `src/lib/supabase/browser.ts` — client components only
- `src/lib/supabase/server.ts` — server components and actions (cookie-based session)
- `src/lib/supabase/service.ts` — admin-only (bypasses RLS; only for webhooks/alerts)

`getUser()` validates session; `requireUser()` throws if unauthenticated.

### AI layer

`src/lib/ai/provider.ts` defines the `AIProvider` interface — Gemini is the real implementation (`GEMINI_MODEL`, default `gemini-3.5-flash`; vision uses `gemini-2.5-flash`); `StubProvider` is used in tests. The orchestrator in `src/modules/assistant/` builds a Spanish-language system prompt with the user's financial context. AI responses return text + a proposed action object; actions are **never auto-executed** — they're surfaced for user confirmation.

Four rules govern that confirmation path:

- **The action lane beats every query lane.** `matchIntent` (`router.ts`) returns `null` for an
  imperative alta with an amount (`esOrdenDeAltaDeMovimiento`, `action-lane.ts`), so the deterministic
  action lane gets it. Otherwise "agregá un gasto … de 37747 el día 2 de agosto" is answered as a
  search — the word "gasto" plus a month name matches `consulta_transacciones` first.
- **A proposal belongs to the turn that asked for it** (`propuesta-turno.ts`). The previous turn stays
  in the model's history window, so it re-emits the `create_transaction` block on the next answer;
  a `create_transaction`/`create_transactions_batch` born from a *question* is dropped server-side,
  and the client closes any still-open proposal when a new message is sent.
- **One editable card.** Chat proposals and scanned receipts share `ReceiptConfirmCard` over the same
  `ReceiptDraft` (`receipt-draft.ts`): amount, date, merchant, currency and sobre are all editable, and
  `aPayloadRecibo` registers exactly what's on the card. Dates said in words are parsed by
  `fecha-natural.ts` against the **profile** timezone; one that can't be parsed is reported, never
  silently replaced by today.
- **Anti-duplicate guard before any write** (`duplicate-guard.ts`): same amount + date + sobre and a
  similar merchant ⇒ ask instead of writing. It never blocks — it asks for explicit confirmation
  (`allowDuplicate`), and it covers chat, receipt and batch alike.

### Insights (the bell / campana)

`src/lib/insights/` powers the dashboard notification bell. Pure `detect*` functions in `detectors.ts` each turn some slice of user data into `DetectedInsight`s (kind + severity + optional `relatedKind`/`relatedId`). `refreshInsights()` runs them behind a **freshness guard** (only if the last run is stale) and hands the result to `syncInsights()`, which **reconciles by `(kind, related_id)`**: a detector that stops emitting an insight marks the persisted row `resuelto` automatically — this is how an insight self-clears once the underlying condition is fixed. `getActiveInsights()` triggers a refresh on read. Keep side-effectful work (merges, expense writes) **out of `refreshInsights()`** — it also runs from the AI context-engine; do such work in the page load instead (see the DCA gap below).

### Snapshots (three tables, three questions)

- `monthly_snapshots` — income/expense/free cashflow per month (`financial-base`).
- `portfolio_snapshots` — daily market value of the **investments** (`wealth`).
- `net_worth_snapshots` — monthly **net worth** (liquid + investments + assets − debts) as the
  Rich Life engine computes it (`rich-life/services/net-worth-snapshot-service.ts`). Period is the
  1st of the month. Written by the monthly cron (`/api/base/snapshot`, which composes both the base
  and the net-worth snapshot — the route does the composing so `financial-base` never depends on
  `rich-life`) and, for the month in progress, by the patrimonio screens on load (web
  `/mi-rich-life`, mobile `/m/patrimonio`) reusing the already-computed `getRichLifeSummary()`.
  The table has no currency column: the writing currency lives inside `breakdown`.

The AI's `consultar_historial` reads net worth from `net_worth_snapshots` and falls back to
`portfolio_snapshots` while that series has fewer than 2 points (old accounts start empty). Sources
are never mixed — their values aren't comparable. `aggregateNetWorth`'s `previousNetWorth` reads the
last **closed** period (`lt` on the current period), otherwise the current month's own row would
zero out `wealthVelocity`.

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

**Voice: Costa Rican voseo, everywhere the user reads.** The landing, FAQs and the subscription path speak with «vos» («Probá», «Elegí», «¿Ya tenés cuenta?»). The auth screens (`/login`, `/signup`, `/reset-password`) still carry some «tú» copy («Crea tu cuenta», «¿Ya tienes cuenta?») — that is a known inconsistency being removed; never add more «tú».

### Brand rules (non-negotiable)

- **The CARTERA+ wordmark is never italic.** `.cw` declares `font-style: normal` in both marketing stylesheets. When the wordmark sits inside an italic phrase, the phrase stays italic and the wordmark stays upright.
- The `+` in the wordmark is green (`--green: #378451`); on green backgrounds use `.cw-inv` (white).
- One isotype: the green «C+» (`#iso` symbol in `landing.tsx`). The auth screens' black rounded «C» (`BrandMark`) is a legacy inconsistency slated for phase 4 of the acquisition plan.

### Marketing CSS (`src/components/marketing/v3/`) — the collision lesson, learned three times

The landing and FAQs are prefixed `.lp` and ship their own stylesheets, but they render inside the root layout, which imports `globals.css` **and Tailwind**. Three separate bugs came from the same cause:

- **A stylesheet only defends what it declares.** Prefixing protects the properties `landing.css` sets, not the ones it leaves at their default — those get filled by whatever else is loaded. `globals.css` set `flex-direction: column` on `.nav` (broke the header); the italic parent set `font-style` on the wordmark; Tailwind set `text-decoration` on the eyebrows.
- **Never name a landing class after a Tailwind utility.** `className="overline"` matched Tailwind's `.overline` utility (`text-decoration-line: overline`) and drew a line above every section label. The rule is not written in any repo file — Tailwind generates it — so grepping `globals.css` finds nothing. The eyebrow class is `lp-rotulo` on purpose. Audit against Tailwind's plain-word utilities (`block`, `hidden`, `italic`, `underline`, `overline`, `truncate`, `uppercase`, `container`, `border`, `shadow`, `ring`, `transition`, `filter`, `blur`, `invert`, …) before adding a class.
- **Declare what must not be inherited** on brand and heading elements: `font-style`, `text-decoration`, `flex-direction`, `letter-spacing`. Cheap to write, expensive to discover by screenshot.

### Acquisition flow (phase plan, Sept 2026)

Reference: the "Plan de adquisición" artifact. Decisions taken: the paid path does **not** require email confirmation before Stripe (the account is created confirmed server-side; payment verifies the email — Stripe prefills and locks it, and sends the receipt); the web subscription page is `/empezar`; Pro is preselected when no plan is chosen; logout lands on `/` (the landing), and `/` never redirects a logged-in user (header shows «Ir a mi panel»).

The flow as built (phase 2): every landing CTA → `/empezar?plan=X` (account + plan on one screen; Google or email+password; `empezarAction` creates the user with `email_confirm: true` and signs in) → `/empezar/pagar` (the **only** door to Stripe: decides by session/plan and redirects to Checkout with `origen: "empezar"`) → Stripe (es-419, custom submit text with the exact first-charge date, recovery enabled) → `/bienvenida?session_id=…`, which calls `cumplirCheckout` itself (idempotent with the webhook) and bounces to `/empezar?reanudar=1` if the plan is still `ninguno`. The middleware wall for `plan = ninguno` also sends to `/empezar?reanudar=1` (resume mode: email read-only, one button), not to `/suscripcion`. `/signup` stays only for invitations (`next` present).

Lessons that cost a run each: (1) a `<form>` cannot nest another `<form>` — the browser drops the inner one and hydration fails; a second server action inside a form goes on the button as `formAction` (with `formNoValidate` if the form has `required` fields), or in a sibling form. (2) The CSP has `form-action 'self'`, and Chrome applies it to the **redirect** of a form submission too: a plain `<form method="get">` whose target 307s to checkout.stripe.com is blocked silently. Anything that ends in Stripe must go through a server action + `redirect()`, never a native form navigation. (3) React 19 resets an uncontrolled form when its action finishes, so validation errors must echo `values` back and the inputs use them as `defaultValue`, or the person retypes everything.

Phase 3 (emails): the **welcome/confirmation email** (plan, $0 today, exact first-charge date and amount, cancel link) is ours — `correo-bienvenida.ts`, sent once per checkout (`processed_events` key `stripe-bienvenida:<session_id>`) from both `/bienvenida` and the webhook. The **day-7 reminder** is NOT ours: it is Stripe's built-in "Send a reminder email 7 days before a free trial ends" (Dashboard → Settings → Billing → Subscriptions and emails), which is what the card networks require and already carries the cancel link. Do not build a second reminder — `customer.subscription.trial_will_end` fires at 3 days, not 7, so it is the wrong hook for that promise. Stripe does not send trial reminders from sandbox/test mode.

Next.js: the "Rendered more hooks than during the previous render" thrown from Next's own `Router` on a server `redirect()` during client navigation (e.g. `/empezar` → `/dashboard` → `/bienvenida`) was a Next bug fixed by a React bump in 16.3.0 (vercel/next.js#95368). We are on 16.3.x for that reason; do not downgrade below it.
