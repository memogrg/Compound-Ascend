/**
 * Delta 3 · cobertura de moneda (#437) — integración contra Postgres REAL.
 *   A · una transacción creada SIN moneda cae a la PRINCIPAL del usuario (no a un CRC
 *       hard-coded): el schema pasó a `.optional()` y el servicio resuelve `getPrimaryCurrency`.
 *   B1 · el guard #437 ahora SIEMPRE tiene dientes: un pago en moneda DISTINTA a la de la deuda
 *       es RECHAZADO; en la nativa, pasa.
 *
 * Gated en SUPABASE_TEST_*; shim `ws` para Node 20 (ver delta 1).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/lib/auth/auth-context";
import { createTransaction } from "@/modules/financial-base/services/transaction-service";
import { createDebt, addDebtPayment } from "@/modules/control/services/control-service";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const pw = "Test1234!seguro";
const email = `curcov-${Date.now()}@example.com`;

describe.skipIf(!ready)("delta 3 · cobertura de moneda (Postgres real)", () => {
  let admin: SupabaseClient<Database>;
  let userId = "";
  let ctx: AuthContext;

  beforeAll(async () => {
    const g = globalThis as { WebSocket?: unknown };
    if (typeof g.WebSocket === "undefined") g.WebSocket = (await import("ws")).default;
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    userId = (await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })).data
      .user!.id;
    // Principal = USD (default de la app = CRC): así "USD" prueba que se respeta la principal.
    await admin.from("user_settings").upsert({ user_id: userId, primary_currency: "USD" });
    ctx = { db: admin, userId };
  });

  afterAll(async () => {
    if (!ready) return;
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("A · transacción SIN moneda → se guarda en la PRINCIPAL (USD), no en CRC", async () => {
    const created = await createTransaction(
      {
        kind: "gasto",
        amount: 100,
        occurredOn: "2026-08-25",
        status: "confirmed",
        origin: "manual",
        // currency OMITIDA a propósito.
      },
      ctx,
    );
    expect(created.currency).toBe("USD"); // resuelta a la principal, no CRC
    const { data } = await admin
      .from("transactions")
      .select("currency")
      .eq("id", created.id)
      .single();
    expect(data?.currency).toBe("USD");
  });

  it("B1 · pago en moneda DISTINTA a la deuda es RECHAZADO por el guard #437", async () => {
    await createDebt(
      {
        name: "Tarjeta CRC",
        balance: 100_000,
        minPayment: 5_000,
        currentPayment: 5_000,
        currency: "CRC",
      },
      ctx,
    );
    const { data: d } = await admin
      .from("debts")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Tarjeta CRC")
      .single();
    const debtId = d!.id;

    // Moneda distinta (USD ≠ CRC) → el guard rechaza ANTES del RPC (ya no se salta en undefined).
    await expect(
      addDebtPayment(
        {
          debtId,
          paymentDate: "2026-08-25",
          amount: 5_000,
          extraAmount: 0,
          kind: "ordinario",
          currency: "USD",
        },
        ctx,
      ),
    ).rejects.toThrow(/CRC|USD|moneda/i);
    // (El camino "moneda nativa pasa el guard" se prueba en la unit `currency-required-guards`:
    // acá el service-role no tiene EXECUTE del RPC record_debt_payment, ajeno a #437.)
  });
});
