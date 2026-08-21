/**
 * Server-side debt fixture — run OUT of the Playwright process, via tsx with the
 * server-only-stub tsconfig (audit/cert/seed.tsconfig.json), exactly the way the sim seeds
 * (createDebt(ctx) headless). The Playwright process itself never imports app services
 * (they pull in `server-only`); seed.ts spawns this as a child process.
 *
 *   mode "seed": createDebt(ctx) for each debt in CERT_DEBTS → prints { debts: {name: {id,currency,balance}} }.
 *   mode "read": getDebtsOverview({}, ctx) + getRealTotals(current period, ctx) → prints each
 *     debt's nativeBalance + converted balance (display CRC) + the period real expense, so the
 *     FX gate exercises the APP's real conversion (not a number the test invents).
 *
 * Only the JSON goes to stdout; the Node/supabase deprecation notice goes to stderr.
 */
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { createDebt } from "@/modules/control/services/control-service";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { getRealTotals } from "@/modules/financial-base/services/transaction-service";
import { userCurrentPeriod } from "@/lib/time/user-time";
import type { AuthContext } from "@/lib/auth/auth-context";

const g = globalThis as unknown as { WebSocket?: unknown };
if (!g.WebSocket) g.WebSocket = WebSocket;

const URL = process.env.SUPABASE_TEST_URL as string;
const ANON = process.env.SUPABASE_TEST_ANON_KEY as string;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY as string;

interface DebtSeed {
  name: string;
  balance: number;
  minPayment: number;
  currency: string;
}

async function ctxFor(email: string, password: string): Promise<AuthContext> {
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const s = await db.auth.signInWithPassword({ email, password });
  if (s.error || !s.data.user) throw new Error(`signin: ${s.error?.message ?? "no user"}`);
  return { db, userId: s.data.user.id } as unknown as AuthContext;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const ctx = await ctxFor(process.env.CERT_EMAIL as string, process.env.CERT_PASSWORD as string);
  const userId = (ctx as unknown as { userId: string }).userId;

  if (mode === "seed") {
    const debts = JSON.parse(process.env.CERT_DEBTS as string) as DebtSeed[];
    for (const d of debts) {
      await createDebt(
        {
          name: d.name,
          balance: d.balance,
          minPayment: d.minPayment,
          currentPayment: d.minPayment,
          apr: 0, // no interest → a payment reduces the balance by its full amount (deterministic)
          currency: d.currency,
        } as never,
        ctx,
      );
    }
    // Read the ids back by name (service-role → no RLS timing).
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
    const { data } = await admin.from("debts").select("id,name,currency,balance").eq("user_id", userId);
    const byName: Record<string, { id: string; currency: string; balance: number }> = {};
    for (const r of data ?? []) byName[r.name] = { id: r.id, currency: r.currency, balance: Number(r.balance) };
    process.stdout.write(JSON.stringify({ debts: byName }));
  } else if (mode === "read") {
    const ov = (await getDebtsOverview({}, ctx)) as unknown as {
      debts: { id: string; name: string; nativeBalance: number; balance: number }[];
    };
    const period = await userCurrentPeriod(ctx);
    const real = (await getRealTotals(period, ctx)) as unknown as { realExpense: number };
    const rows = (ov.debts ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      nativeBalance: d.nativeBalance,
      convertedBalance: d.balance, // conv(nativo, debtCurrency) → display currency (CRC)
    }));
    process.stdout.write(JSON.stringify({ debts: rows, periodRealExpense: real.realExpense }));
  } else {
    throw new Error(`modo desconocido: ${mode}`);
  }
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`[debt-fixture] ${String(e?.message ?? e)}`);
  process.exit(1);
});
