/**
 * Simulacro del cron del cierre de mes, contra Postgres REAL: tres cuentas, una por perfil.
 *
 * El PR 3 del plan 15 hace que el cron materialice las líneas derivadas del mes CERRADO para
 * todos los usuarios, en modo `congelado` (solo inserta). Lo que hay que demostrar antes de
 * soltarlo sobre la base de producción son dos cosas distintas:
 *
 *   A · quien SÍ abrió la app en ese mes ya tiene sus líneas, y el cron no debe tocar NINGUNA:
 *       ni el importe, ni el id, ni el `updated_at`. Un mes cerrado no se reescribe con los
 *       números de hoy (la cuota que subió en octubre no puede reescribir agosto).
 *   B · quien NO la abrió no tiene ninguna, y el cron se las escribe: es el escalón que este
 *       PR viene a cerrar.
 *   C · quien no tiene compromisos no gana nada de la nada.
 *
 * Las tres cuentas se crean acá —no se reutilizan cuentas ajenas— y se borran al final. Contra
 * la base LOCAL: gated en `SUPABASE_TEST_*`, igual que el resto de `tests/rls`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { syncDerivedBudget } from "@/modules/financial-base/services/derived-budget-service";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const pw = "Test1234!seguro";
/** El mes CERRADO del simulacro. Fijo: el reloj no entra en esta prueba. */
const CERRADO = {
  year: 2026,
  month: 8,
  label: "ago 2026",
  from: "2026-08-01",
  to: "2026-08-31",
};

type Fila = {
  id: string;
  name: string;
  amount: number;
  source_kind: string | null;
  updated_at: string;
};

describe.skipIf(!ready)("cron del cierre de mes · congelar derivadas (Postgres real)", () => {
  let admin: SupabaseClient<Database>;
  const ids: Record<"A" | "B" | "C", string> = { A: "", B: "", C: "" };

  /** Las líneas derivadas de ese usuario en el mes cerrado, ordenadas y comparables. */
  async function derivadas(userId: string): Promise<Fila[]> {
    const { data } = await admin
      .from("budget_items")
      .select("id,name,amount,source_kind,updated_at")
      .eq("user_id", userId)
      .eq("period_year", CERRADO.year)
      .eq("period_month", CERRADO.month)
      .neq("source_kind", "manual")
      .order("name");
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      amount: Number(r.amount),
      source_kind: r.source_kind,
      updated_at: String(r.updated_at),
    }));
  }

  function tabla(titulo: string, filas: Record<string, Fila[]>): void {
    const lineas = Object.entries(filas).map(
      ([k, v]) =>
        `  ${k}: ${v.length} línea(s)` +
        (v.length > 0
          ? ` · ${v.map((f) => `${f.name}=${f.amount} (${f.source_kind})`).join(" · ")}`
          : ""),
    );
    console.log(`\n${titulo}\n${lineas.join("\n")}`);
  }

  beforeAll(async () => {
    // supabase-js inicializa realtime en su constructor y busca un `WebSocket` global; Node < 22
    // no lo trae. Nunca usamos realtime: le prestamos el de `ws` (devDeps). No-op en Node 22+.
    const g = globalThis as { WebSocket?: unknown };
    if (typeof g.WebSocket === "undefined") g.WebSocket = (await import("ws")).default;

    admin = createClient<Database>(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sello = Date.now();
    for (const perfil of ["A", "B", "C"] as const) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `congelar-${perfil}-${sello}@example.com`,
        password: pw,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error(`no se creó la cuenta ${perfil}`);
      ids[perfil] = data.user.id;
    }

    // A y B tienen la MISMA deuda (mismo importe): la única diferencia entre las dos cuentas es
    // si el mes cerrado ya tiene la línea derivada o no.
    for (const perfil of ["A", "B"] as const) {
      const { error } = await admin.from("debts").insert({
        user_id: ids[perfil],
        name: "Préstamo del simulacro",
        debt_type: "prestamo_personal",
        balance: 1_000_000,
        currency: "CRC",
        min_payment: 50_000,
        apr: 18,
        is_current: true,
      });
      if (error) throw error;
    }

    // A «abrió la app en agosto»: su línea derivada ya existe, con un importe VIEJO y distinto
    // del de hoy. Si el cron la reescribiera, se vería justo en ese número.
    const { error: e2 } = await admin.from("budget_items").insert({
      user_id: ids.A,
      type: "expense",
      name: "Pago — Préstamo del simulacro",
      amount: 41_000,
      currency: "CRC",
      frequency: "mensual",
      period_year: CERRADO.year,
      period_month: CERRADO.month,
      source_kind: "debt",
      source_id: null,
      created_by: ids.A,
    });
    if (e2) throw e2;
  }, 60_000);

  afterAll(async () => {
    for (const id of Object.values(ids)) {
      if (id) await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  it("A no se toca, B se materializa, C sigue vacía", async () => {
    const antes = {
      A: await derivadas(ids.A),
      B: await derivadas(ids.B),
      C: await derivadas(ids.C),
    };
    tabla(`ANTES · periodo ${CERRADO.label}`, antes);
    expect(antes.A).toHaveLength(1);
    expect(antes.B).toHaveLength(0);
    expect(antes.C).toHaveLength(0);

    // Lo que hace el cron, cuenta por cuenta (es exactamente el cuerpo del barrido).
    for (const perfil of ["A", "B", "C"] as const) {
      await syncDerivedBudget(CERRADO, { db: admin, userId: ids[perfil] }, { congelado: true });
    }

    const despues = {
      A: await derivadas(ids.A),
      B: await derivadas(ids.B),
      C: await derivadas(ids.C),
    };
    tabla(`DESPUÉS · periodo ${CERRADO.label}`, despues);

    // A · IDÉNTICA, `updated_at` incluido. Es la condición de parada del plan: ningún UPDATE ni
    // DELETE sobre un mes cerrado.
    expect(despues.A).toEqual(antes.A);

    // B · ahora tiene su línea, con la cuota de la deuda.
    expect(despues.B).toHaveLength(1);
    expect(despues.B[0]).toMatchObject({
      name: "Pago — Préstamo del simulacro",
      amount: 50_000,
      source_kind: "debt",
    });

    // C · nada sale de la nada.
    expect(despues.C).toHaveLength(0);
  }, 120_000);

  it("y una segunda corrida del cron no cambia nada (idempotente)", async () => {
    const antes = {
      A: await derivadas(ids.A),
      B: await derivadas(ids.B),
      C: await derivadas(ids.C),
    };
    for (const perfil of ["A", "B", "C"] as const) {
      await syncDerivedBudget(CERRADO, { db: admin, userId: ids[perfil] }, { congelado: true });
    }
    const despues = {
      A: await derivadas(ids.A),
      B: await derivadas(ids.B),
      C: await derivadas(ids.C),
    };
    tabla(`SEGUNDA CORRIDA · periodo ${CERRADO.label}`, despues);
    // El cron corre una vez al mes, pero un reintento manual no puede duplicar ni reescribir.
    expect(despues).toEqual(antes);
  }, 120_000);
});
