import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Regresión: el cron de recordatorios de cuota mandaba correo aunque el usuario hubiera
 * apagado el canal "Correo" en configuración. El resumen semanal y las alertas de precio
 * sí lo respetaban; este no. La FAQ promete que se pueden apagar desde ahí, así que la
 * promesa era falsa justo para el aviso del que habla la pregunta.
 */
const prefsPorUsuario = new Map<string, { email: boolean }>();
vi.mock("@/lib/notifications/preferences", () => ({
  getNotificationPrefs: vi.fn(async (userId: string) => ({
    email: prefsPorUsuario.get(userId)?.email ?? true,
    push: true,
    inApp: true,
  })),
}));

// Una deuda por usuario, ambas venciendo hoy y sin pagos ni recordatorio previo.
const DEUDAS = [
  {
    id: "d-si",
    user_id: "u-si",
    name: "Tarjeta",
    bank: "BAC",
    currency: "CRC",
    current_payment: 50_000,
    min_payment: 50_000,
    pay_day: 15,
    start_date: "2026-01-15",
    is_current: true,
    last_reminded_on: null,
  },
  {
    id: "d-no",
    user_id: "u-no",
    name: "Préstamo",
    bank: null,
    currency: "CRC",
    current_payment: 90_000,
    min_payment: 90_000,
    pay_day: 15,
    start_date: "2026-01-15",
    is_current: true,
    last_reminded_on: null,
  },
];

function fakeDb() {
  const tabla = (filas: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "neq", "gte", "eq", "maybeSingle"]) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: null });
    q.then = (res: (v: unknown) => unknown) => Promise.resolve(res({ data: filas, error: null }));
    return q;
  };
  return {
    from: (t: string) => tabla(t === "debts" ? DEUDAS : []),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { email: `${id}@x.com` } } }),
      },
    },
  };
}

vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => fakeDb() }));

beforeEach(() => {
  prefsPorUsuario.clear();
  prefsPorUsuario.set("u-si", { email: true });
  prefsPorUsuario.set("u-no", { email: false });
});

describe("getDueReminders · respeta el canal de correo", () => {
  it("con el canal apagado devuelve email null (el llamador no manda nada)", async () => {
    const { getDueReminders } = await import("@/modules/control/services/debt-reminders-service");
    // Día 14: la cuota del 15 vence "pronto" (≤2 días) para ambas deudas.
    const avisos = await getDueReminders(new Date("2026-09-14T12:00:00Z"));

    const si = avisos.find((a) => a.userId === "u-si");
    const no = avisos.find((a) => a.userId === "u-no");
    expect(si?.email).toBe("u-si@x.com");
    // El candidato sigue apareciendo (la deuda vence igual); lo que se apaga es el envío.
    expect(no?.email).toBeNull();
  });
});
