/**
 * Delta 2 · nudge del fondo de emergencia — integración contra Postgres REAL.
 * Cubre la mutación nueva `convertGoalToEmergencyFundAction` de punta a punta:
 *   (a) `getDefenseFundsReport.emergencyCandidate` detecta una meta name-match "emergencia"
 *       con saldo y SIN fondo formal;
 *   (b) `convertGoalToEmergencyFund` setea `goal_type='defensa:fondo_emergencia'` respetando el
 *       scope de hogar (NO toca la meta de otro usuario);
 *   (c) tras convertir, `getDefenseFundsReport` ya la cuenta como fondo formal (registrado, con
 *       saldo, y sin candidato pendiente).
 *
 * Requiere Supabase de PRUEBAS (NO producción): SUPABASE_TEST_URL / _ANON_KEY /
 * _SERVICE_ROLE_KEY. Si faltan, se omite. El config de vitest NO carga .env.local: inyectá las
 * vars en el shell. Shim `ws` para Node 20 (realtime de supabase-js exige WebSocket; ver delta 1).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/lib/auth/auth-context";
import { createGoal, convertGoalToEmergencyFund } from "@/modules/control/services/control-service";
import { getDefenseFundsReport } from "@/modules/wealth/services/fund-sizing-service";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const pw = "Test1234!seguro";
const emailA = `nudge-a-${Date.now()}@example.com`;
const emailB = `nudge-b-${Date.now()}@example.com`;

const goalInput = (name: string, current: number) => ({
  name,
  kind: "meta" as const,
  targetAmount: 1_000_000,
  currentAmount: current,
  monthlyContribution: 0,
  currency: "CRC",
  recurrence: "ninguna" as const,
});

describe.skipIf(!ready)("delta 2 · nudge fondo de emergencia (Postgres real)", () => {
  let admin: SupabaseClient<Database>;
  let userA = "";
  let userB = "";
  let goalA = "";
  let goalB = "";
  let ctxA: AuthContext;

  beforeAll(async () => {
    // supabase-js inicializa realtime en su constructor y busca un `WebSocket` global; Node < 22
    // no lo trae. Nunca usamos realtime: le prestamos el de `ws` (devDeps). No-op en Node 22+.
    const g = globalThis as { WebSocket?: unknown };
    if (typeof g.WebSocket === "undefined") g.WebSocket = (await import("ws")).default;

    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    userA = (
      await admin.auth.admin.createUser({ email: emailA, password: pw, email_confirm: true })
    ).data.user!.id;
    userB = (
      await admin.auth.admin.createUser({ email: emailB, password: pw, email_confirm: true })
    ).data.user!.id;
    ctxA = { db: admin, userId: userA };
    const ctxB: AuthContext = { db: admin, userId: userB };

    // Meta genérica de A llamada "emergencia", SIN goal_type formal, con saldo → candidato.
    goalA = await createGoal(goalInput("Fondo de emergencia", 200_000), ctxA);
    // Meta de B (otro usuario), también name-match → para el test de scope.
    goalB = await createGoal(goalInput("Reserva emergencia", 100_000), ctxB);
  });

  afterAll(async () => {
    if (!ready) return;
    // El borrado del usuario cascada a savings_goals (FK on delete cascade).
    if (userA) await admin.auth.admin.deleteUser(userA);
    if (userB) await admin.auth.admin.deleteUser(userB);
  });

  it("(a) detección: emergencyCandidate identifica el goal name-match sin fondo formal", async () => {
    const report = await getDefenseFundsReport(ctxA);
    expect(report.emergencyRegistered).toBe(false);
    expect(report.emergencyCandidate).toEqual({ id: goalA, name: "Fondo de emergencia" });
  });

  it("(b) scope de hogar: A NO puede convertir la meta de B", async () => {
    await convertGoalToEmergencyFund(goalB, ctxA); // scope de A = [A]; goalB es de B → sin efecto
    const { data } = await admin.from("savings_goals").select("goal_type").eq("id", goalB).single();
    expect(data?.goal_type).toBeNull(); // intacta
  });

  it("(b+c) convierte la propia y pasa a contar como fondo formal", async () => {
    await convertGoalToEmergencyFund(goalA, ctxA);
    const { data } = await admin.from("savings_goals").select("goal_type").eq("id", goalA).single();
    expect(data?.goal_type).toBe("defensa:fondo_emergencia");

    const after = await getDefenseFundsReport(ctxA);
    expect(after.emergencyRegistered).toBe(true);
    expect(after.emergencyCandidate).toBeNull();
    expect(after.emergency.current).toBeGreaterThan(0); // ya cuenta como fondo formal
  });
});
