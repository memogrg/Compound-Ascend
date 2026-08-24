/**
 * Server-side portfolio fixture — run OUT of the Playwright process, via tsx with the
 * server-only-stub tsconfig (audit/cert/seed.tsconfig.json), the same headless path the debt
 * fixture uses. The Playwright process can't import app services (they pull in `server-only`);
 * seed.ts spawns this as a child process for the SOFT net-worth gate of journey #5.
 *
 *   mode "portfolio": getPortfolioMarketValues(ctx) → the investments value in the user's PRIMARY
 *     currency (CRC), computed by the APP (live market price, or cost-basis fallback when a price
 *     is missing — portfolio-service line ~460), converted via the app's own convertCurrency +
 *     getFxRates. Prints { portfolio: { totalCRC, currency, holdingsCount } } so the test asserts
 *     the RELATION (holding included, value > 0, converted ≫ native USD) without inventing a number.
 *
 * Only the JSON goes to stdout; the Node/supabase deprecation notice goes to stderr.
 */
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { getPortfolioMarketValues } from "@/modules/wealth/services/portfolio-service";
import { listHoldings } from "@/modules/wealth/services/holdings-service";
import type { AuthContext } from "@/lib/auth/auth-context";

const g = globalThis as unknown as { WebSocket?: unknown };
if (!g.WebSocket) g.WebSocket = WebSocket;

const URL = process.env.SUPABASE_TEST_URL as string;
const ANON = process.env.SUPABASE_TEST_ANON_KEY as string;

async function ctxFor(email: string, password: string): Promise<AuthContext> {
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const s = await db.auth.signInWithPassword({ email, password });
  if (s.error || !s.data.user) throw new Error(`signin: ${s.error?.message ?? "no user"}`);
  return { db, userId: s.data.user.id } as unknown as AuthContext;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const ctx = await ctxFor(process.env.CERT_EMAIL as string, process.env.CERT_PASSWORD as string);

  if (mode === "portfolio") {
    const [mv, holdings] = await Promise.all([getPortfolioMarketValues(ctx), listHoldings(ctx)]);
    process.stdout.write(
      JSON.stringify({
        portfolio: { totalCRC: mv.total, currency: mv.currency, holdingsCount: holdings.length },
      }),
    );
  } else {
    throw new Error(`modo desconocido: ${mode}`);
  }
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`[holding-fixture] ${String(e?.message ?? e)}`);
  process.exit(1);
});
