/**
 * El cron de reinicio de frascos (goal-reset-service) debe razonar en el día LOCAL
 * de cada usuario, no en UTC. Vercel corre el cron en UTC: a las 23:00 en UTC−6
 * (05:00 UTC del día siguiente) un cálculo en UTC guardaría `reset_on` con +1 día y
 * podría reiniciar un frasco un día antes de tiempo.
 *
 * Servicio REAL con service-role mockeado (mismo patrón que snapshot-cron-service.test).
 * `today` se inyecta para fijar el instante — determinista, sin depender del reloj.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const mock = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mock.client,
}));

import { rollDueGoalPeriods } from "@/modules/control/services/goal-reset-service";

type GoalRow = {
  id: string;
  user_id: string;
  household_id: string | null;
  current_amount: number;
  target_amount: number;
  period_amount: number | null;
  recurrence: string;
  next_reset_on: string | null;
};
type SettingRow = { user_id: string; timezone: string | null };

type Captures = {
  goalUpdates: Array<{ id: unknown; row: Record<string, unknown> }>;
  resetInserts: Array<Record<string, unknown>>;
  savingsLteBound: string | null;
};

/** Cliente service-role falso: builder encadenable que resuelve por tabla + operación. */
function makeSupabase(opts: { goals: GoalRow[]; settings: SettingRow[] }): {
  client: unknown;
  captures: Captures;
} {
  const captures: Captures = { goalUpdates: [], resetInserts: [], savingsLteBound: null };

  const client = {
    from(table: string) {
      let op: "select" | "update" | "insert" = "select";
      let payload: Record<string, unknown> = {};
      let eqId: unknown = null;

      const resolveValue = (): unknown => {
        if (op === "update") {
          captures.goalUpdates.push({ id: eqId, row: payload });
          return { error: null };
        }
        if (op === "insert") {
          captures.resetInserts.push(payload);
          return { error: null };
        }
        if (table === "savings_goals") return { data: opts.goals, error: null };
        if (table === "user_settings") return { data: opts.settings, error: null };
        return { data: [], error: null };
      };

      const q = {
        select: () => q,
        neq: () => q,
        not: () => q,
        in: () => q,
        gt: () => q,
        gte: () => q,
        lte: (_col: string, val: string) => {
          if (table === "savings_goals") captures.savingsLteBound = val;
          return q;
        },
        eq: (_col: string, val: unknown) => {
          if (op === "update") eqId = val;
          return q;
        },
        update: (row: Record<string, unknown>) => {
          op = "update";
          payload = row;
          return q;
        },
        insert: (row: Record<string, unknown>) => {
          op = "insert";
          payload = row;
          return q;
        },
        then: (resolve: (v: unknown) => void) => resolve(resolveValue()),
      };
      return q;
    },
  };

  return { client, captures };
}

const USER = "11111111-1111-4111-8111-111111111111";
const CR = "America/Costa_Rica"; // UTC−6 todo el año (sin DST)
const KIRITIMATI = "Pacific/Kiritimati"; // UTC+14 todo el año

function goal(over: Partial<GoalRow> = {}): GoalRow {
  return {
    id: "g1",
    user_id: USER,
    household_id: "h1",
    current_amount: 180_000,
    target_amount: 200_000,
    period_amount: 1_000_000,
    recurrence: "anual",
    next_reset_on: "2026-08-31",
    ...over,
  };
}

let current: Captures;
function install(opts: { goals: GoalRow[]; settings: SettingRow[] }) {
  const fake = makeSupabase(opts);
  mock.client = fake.client;
  current = fake.captures;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rollDueGoalPeriods · zona horaria por usuario", () => {
  it("reset_on = día LOCAL del usuario, no UTC+1 a las 23:00 en UTC−6", async () => {
    // 2026-08-31 23:00 en Costa Rica = 2026-09-01 05:00 UTC.
    const today = new Date("2026-09-01T05:00:00Z");
    install({
      goals: [goal({ next_reset_on: "2026-08-31" })],
      settings: [{ user_id: USER, timezone: CR }],
    });

    const { reset } = await rollDueGoalPeriods(today);

    expect(reset).toBe(1);
    expect(current.resetInserts).toHaveLength(1);
    expect(current.resetInserts[0]!.reset_on).toBe("2026-08-31"); // día local
    expect(current.resetInserts[0]!.reset_on).not.toBe("2026-09-01"); // NO el día UTC
    expect(current.resetInserts[0]!.restored_target).toBe(1_000_000);
    expect(current.resetInserts[0]!.carried_over).toBe(180_000);
    // next_reset_on avanza desde el día LOCAL.
    expect(current.goalUpdates[0]!.row.next_reset_on).toBe("2027-08-31");
    expect(current.goalUpdates[0]!.row.target_amount).toBe(1_000_000);
    expect(current.goalUpdates[0]!.row.status).toBe("revisar");
  });

  it("NO reinicia si next_reset_on ya es hoy en UTC pero todavía es mañana en la zona local", async () => {
    // En CR sigue siendo 2026-08-31; el frasco vence el 2026-09-01 (mañana local).
    const today = new Date("2026-09-01T05:00:00Z");
    install({
      goals: [goal({ next_reset_on: "2026-09-01", recurrence: "mensual" })],
      settings: [{ user_id: USER, timezone: CR }],
    });

    const { reset } = await rollDueGoalPeriods(today);

    expect(reset).toBe(0);
    expect(current.resetInserts).toHaveLength(0);
    expect(current.goalUpdates).toHaveLength(0);
  });

  it("zona adelantada (UTC+14): reinicia con el día local aunque en UTC sea ayer, y amplía el filtro a UTC+1", async () => {
    // 2026-08-31 12:00 UTC = 2026-09-01 02:00 en Kiribati.
    const today = new Date("2026-08-31T12:00:00Z");
    install({
      goals: [goal({ next_reset_on: "2026-09-01" })],
      settings: [{ user_id: USER, timezone: KIRITIMATI }],
    });

    const { reset } = await rollDueGoalPeriods(today);

    expect(reset).toBe(1);
    expect(current.resetInserts[0]!.reset_on).toBe("2026-09-01"); // día local
    // El filtro SQL debe traer hasta el día UTC + 1 para no perder zonas adelantadas.
    expect(current.savingsLteBound).toBe("2026-09-01");
  });

  it("sin zona capturada cae a UTC (no regresión para el caso común)", async () => {
    const today = new Date("2026-09-01T05:00:00Z");
    install({ goals: [goal({ next_reset_on: "2026-09-01" })], settings: [] });

    const { reset } = await rollDueGoalPeriods(today);

    expect(reset).toBe(1);
    expect(current.resetInserts[0]!.reset_on).toBe("2026-09-01"); // = día UTC
  });
});
