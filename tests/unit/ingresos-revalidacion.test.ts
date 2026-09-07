/**
 * REVALIDACIÓN DE FONDO de las acciones de ingreso.
 *
 * El bug: al marcar "Recibido" en el MÓVIL la barra no se movía hasta recargar a
 * mano. La causa no estaba en el cliente sino acá: de todo `v2-actions.ts` sólo
 * `/m/transacciones` estaba revalidada, así que el árbol de rutas `/m/...`
 * seguía sirviendo el dato viejo por más `router.refresh()` que hiciera la UI.
 *
 * Este test fija la cobertura: toda acción que cambia una fuente de ingreso
 * revalida las rutas que la pintan, web Y móvil. Si alguien agrega una acción de
 * ingreso y olvida el móvil, esto falla.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Los tipos van explícitos: sin ellos TS infiere del valor inicial
// (`agendadoPara: null` como tipo literal) y rechaza el mockResolvedValueOnce
// que devuelve un periodo.
const h = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  registerIncomeSource: vi.fn(
    async (): Promise<{
      budgetItemId: string | null;
      agendadoPara: { year: number; month: number } | null;
    }> => ({ budgetItemId: "b1", agendadoPara: null }),
  ),
  updateIncomeSource: vi.fn(async (): Promise<{ fueraDeFase: boolean }> => ({
    fueraDeFase: false,
  })),
  deleteIncomeSource: vi.fn(async () => {}),
  receivePartialIncome: vi.fn(async () => {}),
  removeOutOfPhaseIncomeLine: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => true,
  requireUser: async () => ({ id: "u1" }),
}));
vi.mock("@/modules/financial-base/services/budget-service", async () => {
  const real = await vi.importActual<
    typeof import("@/modules/financial-base/services/budget-service")
  >("@/modules/financial-base/services/budget-service");
  return {
    ...real,
    registerIncomeSource: h.registerIncomeSource,
    updateIncomeSource: h.updateIncomeSource,
    deleteIncomeSource: h.deleteIncomeSource,
    receivePartialIncome: h.receivePartialIncome,
    removeOutOfPhaseIncomeLine: h.removeOutOfPhaseIncomeLine,
  };
});

import {
  registerIncomeSourceAction,
  updateIncomeSourceAction,
  deleteIncomeSourceAction,
  receivePartialIncomeAction,
  removeOutOfPhaseIncomeLineAction,
} from "@/modules/financial-base/api/v2-actions";

const fuente = {
  name: "Salario",
  amount: 1000,
  currency: "USD",
  occurredOn: "2026-09-15",
  incomeType: "activo" as const,
  recurrent: false,
  frequency: "mensual" as const,
  categoryId: null,
};

/** Rutas que pintan fuentes de ingreso. El móvil vive en su propio árbol. */
const WEB = ["/mi-base-financiera", "/dashboard", "/ingresos"];
const MOVIL = ["/m/ingresos", "/m/mi-base-financiera", "/m"];

const revalidadas = () => h.revalidatePath.mock.calls.map((c) => c[0] as string);

const UUID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  // TODOS, no sólo revalidatePath: limpiar uno solo deja que el historial de los
  // demás se filtre entre tests (es el flake que cazó #748, en versión propia).
  for (const m of Object.values(h)) m.mockClear();
});

describe("toda acción de ingreso revalida web Y móvil", () => {
  it("receivePartialIncomeAction — el caso del bug", async () => {
    const res = await receivePartialIncomeAction({
      budgetItemId: UUID, // el schema exige uuid
      amount: 100,
      date: "2026-09-15",
    });
    expect(res.ok).toBe(true);
    for (const r of [...WEB, ...MOVIL]) expect(revalidadas()).toContain(r);
  });

  it("registerIncomeSourceAction", async () => {
    expect((await registerIncomeSourceAction(fuente)).ok).toBe(true);
    for (const r of [...WEB, ...MOVIL]) expect(revalidadas()).toContain(r);
  });

  it("updateIncomeSourceAction", async () => {
    expect((await updateIncomeSourceAction("b1", fuente)).ok).toBe(true);
    for (const r of [...WEB, ...MOVIL]) expect(revalidadas()).toContain(r);
  });

  it("deleteIncomeSourceAction", async () => {
    expect((await deleteIncomeSourceAction("b1")).ok).toBe(true);
    for (const r of [...WEB, ...MOVIL]) expect(revalidadas()).toContain(r);
  });

  it("removeOutOfPhaseIncomeLineAction", async () => {
    expect((await removeOutOfPhaseIncomeLineAction("b1")).ok).toBe(true);
    for (const r of [...WEB, ...MOVIL]) expect(revalidadas()).toContain(r);
  });
});

describe("el alta informa cuándo quedó agendada", () => {
  it("con línea creada no dice nada (no hay nada que aclarar)", async () => {
    h.registerIncomeSource.mockResolvedValueOnce({ budgetItemId: "b1", agendadoPara: null });
    const res = await registerIncomeSourceAction(fuente);
    expect(res.agendadoPara).toBeUndefined();
  });

  it("sin línea de este mes, nombra el MES del primer pago", async () => {
    h.registerIncomeSource.mockResolvedValueOnce({
      budgetItemId: null,
      agendadoPara: { year: 2026, month: 10 },
    });
    const res = await registerIncomeSourceAction(fuente);
    expect(res.agendadoPara).toBe("octubre 2026");
  });
});

describe("la edición avisa si la línea quedó fuera de fase", () => {
  it("en fase → sin bandera", async () => {
    h.updateIncomeSource.mockResolvedValueOnce({ fueraDeFase: false });
    expect((await updateIncomeSourceAction("b1", fuente)).fueraDeFase).toBeUndefined();
  });

  it("fuera de fase → bandera, pero NO borra nada (lo decide la persona)", async () => {
    h.updateIncomeSource.mockResolvedValueOnce({ fueraDeFase: true });
    const res = await updateIncomeSourceAction("b1", fuente);
    expect(res.fueraDeFase).toBe(true);
    expect(h.removeOutOfPhaseIncomeLine).not.toHaveBeenCalled();
  });
});
