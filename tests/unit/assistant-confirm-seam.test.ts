/**
 * LA COSTURA DEL CHAT: propuesta → tarjeta → confirmar → **ejecutar**.
 *
 * Las `confirm*Action` de `modules/assistant/api/actions.ts` no hacen el trabajo: delegan en
 * server actions de OTROS módulos (financial-base, control, wealth, lib/rhythm). Todo lo que
 * tienen es el armado del payload — y eso es justo lo que nadie probaba.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 * Ya dejó pasar una regresión en verde. Al agregarse la ventana de configuración,
 * `setEnvelopeBudgetAction` pasó a exigir `confirmedOutsideWindow` para editar fuera de los
 * días 1-5, y `confirmAdjustBudgetAction` no lo mandaba: confirmar un ajuste desde el chat
 * fuera de la ventana devolvía `needsConfirmation` y moría ahí — la tarjeta no tiene dónde
 * pedir una segunda confirmación, así que el usuario quedaba sin salida. Typecheck y 2300+
 * tests pasaban: los que cubren esta zona son puros y prueban los DETECTORES y los
 * RESOLVERS, nunca que lo confirmado llegue a escribirse.
 *
 * Se descubrió leyendo el código. Este archivo es para que la próxima la descubra el CI.
 *
 * ── QUÉ SE PRUEBA, Y QUÉ NO ─────────────────────────────────────────────────
 * NO se prueba que la acción destino haga bien su trabajo (eso es de su propio módulo), ni
 * la lógica de negocio. Se prueba **el contrato de la costura**: que cada confirmación
 * invoque a su destino, con el payload completo, incluidos los campos que el destino exige
 * hoy. Un test de forma, deliberadamente aburrido — es la clase de cosa que sale barata y
 * caza exactamente el error que se escapó.
 *
 * ── CÓMO SE MOCKEA (el detalle que oculta el bug) ───────────────────────────
 * Las cuatro acciones de CONSEJO resuelven su destino con `await import()` DENTRO de la
 * función, no con un import estático arriba. `vi.mock` igual las intercepta —el registro de
 * módulos de Vitest es el mismo para import estático y dinámico— pero hay que mockear el
 * MÓDULO del que salen, y en dos casos ese módulo es un barrel (`@/modules/financial-base`,
 * `@/modules/wealth`), no el archivo del servicio. Mockear el archivo profundo no
 * interceptaría nada y el test pasaría sin probar nada.
 *
 * Por eso los mocks reponen TODOS los exports que `actions.ts` usa de cada barrel, no solo
 * el que se está probando: `vi.mock` reemplaza el módulo entero.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => true,
  getUser: async () => ({ id: "u1" }),
}));

// ── Destinos: lo que estas pruebas observan ─────────────────────────────────
// El tipo de retorno va ANOTADO y no inferido: sin él TypeScript deduce `{ ok: boolean }` del
// valor por defecto y después rechaza los `mockResolvedValueOnce` que traen `message` — que son
// justo los casos donde se comprueba que el motivo del rechazo llega al usuario.
type Res = { ok: boolean; message?: string };
const setEnvelopeBudgetAction = vi.fn(async (_raw: unknown): Promise<Res> => ({ ok: true }));
const setHoldingDcaAction = vi.fn(async (_id: string, _monto: number): Promise<Res> => ({
  ok: true,
}));
const moverPresupuestoEntreSobres = vi.fn(async (_args: unknown): Promise<Res> => ({ ok: true }));
const reportPaymentAction = vi.fn(async (_args: unknown): Promise<Res> => ({ ok: true }));
const archiveFact = vi.fn(async (_id: string): Promise<void> => undefined);

vi.mock("@/modules/financial-base", () => ({
  setEnvelopeBudgetAction: (raw: unknown) => setEnvelopeBudgetAction(raw),
  // Exports que actions.ts importa de forma ESTÁTICA: sin ellos el módulo ni carga.
  listSobresForKind: async () => [],
  getSobreRemaining: async () => null,
}));

vi.mock("@/modules/wealth", () => ({
  setHoldingDcaAction: (id: string, monto: number) => setHoldingDcaAction(id, monto),
  createInvestmentAlert: async () => ({ ok: true }),
}));

vi.mock("@/lib/rhythm/rhythm-service", () => ({
  moverPresupuestoEntreSobres: (args: unknown) => moverPresupuestoEntreSobres(args),
}));

vi.mock("@/modules/control", async () => {
  // `goalInputSchema` es un schema REAL que actions.ts usa en el parseo de confirmGoalAction.
  // Se repone con uno laxo: esa acción no está bajo prueba y un stub que no sea zod rompería
  // la carga del módulo.
  const { z } = await import("zod");
  return {
    reportPaymentAction: (args: unknown) => reportPaymentAction(args),
    // Delta 3 (B1): confirmDebtExtraPaymentAction resuelve la moneda NATIVA de la deuda.
    getDebt: async () => ({ currency: "CRC" }),
    createGoal: async () => "g1",
    goalInputSchema: z.object({}).passthrough(),
  };
});

vi.mock("@/modules/assistant/services/transaction-service", () => ({
  createTransaction: async () => undefined,
}));
vi.mock("@/lib/ai/chat-store", () => ({
  loadRetainedChat: async () => [],
  loadTodayChat: async () => [],
  buildTranscriptText: () => "",
  startOfCostaRicaDayISO: () => "2026-08-09T06:00:00.000Z",
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: async () => ({ ok: true }) }));

// Memoria personal: `forgetMemoryFactAction` delega en el store, igual que las de consejo delegan
// en sus módulos. Se mockea el MÓDULO del que sale el símbolo (`memory-store`), que es lo que
// `actions.ts` importa dinámicamente.
vi.mock("@/lib/ai/memory-store", () => ({
  archiveFact: (id: string) => archiveFact(id),
  listMemoryForUser: async () => [],
  updateFactText: async () => undefined,
  deleteFact: async () => undefined,
  clearMemory: async () => undefined,
}));

import {
  confirmAdjustBudgetAction,
  confirmMoveBudgetAction,
  confirmSetDcaAction,
  confirmDebtExtraPaymentAction,
  forgetMemoryFactAction,
} from "@/modules/assistant/api/actions";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmAdjustBudgetAction · ajustar el presupuesto de un sobre", () => {
  const payload = {
    categoryId: UUID_A,
    name: "Comida",
    amount: 250_000,
    currency: "CRC",
    periodMonth: 8,
    periodYear: 2026,
  };

  it("llega al destino con el payload completo", async () => {
    const res = await confirmAdjustBudgetAction(payload);
    expect(res.ok).toBe(true);
    expect(setEnvelopeBudgetAction).toHaveBeenCalledTimes(1);
    expect(setEnvelopeBudgetAction.mock.calls[0]![0]).toMatchObject(payload);
  });

  it("MANDA `confirmedOutsideWindow` — la regresión que este archivo existe para cazar", async () => {
    // El tap de "Confirmar" en la tarjeta ES la confirmación explícita que pide la ventana de
    // configuración. Sin este campo, `setEnvelopeBudgetAction` devuelve `needsConfirmation` y
    // la tarjeta del chat queda en un callejón sin salida: no tiene dónde preguntar de nuevo.
    await confirmAdjustBudgetAction(payload);
    const enviado = setEnvelopeBudgetAction.mock.calls[0]![0] as Record<string, unknown>;
    expect(enviado.confirmedOutsideWindow).toBe(true);
  });

  it("propaga el motivo del rechazo en vez de tragárselo", async () => {
    // El candado de líneas derivadas ("edítala desde su módulo") tiene que llegar al usuario:
    // un "no pudimos" genérico lo deja sin saber qué hacer.
    setEnvelopeBudgetAction.mockResolvedValueOnce({
      ok: false,
      message: "Esta línea se deriva de una entidad; edítala desde su módulo.",
    });
    const res = await confirmAdjustBudgetAction(payload);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("se deriva de una entidad");
  });

  it("no llama al destino con un payload inválido", async () => {
    const res = await confirmAdjustBudgetAction({ ...payload, categoryId: "no-es-uuid" });
    expect(res.ok).toBe(false);
    expect(setEnvelopeBudgetAction).not.toHaveBeenCalled();
  });
});

describe("confirmMoveBudgetAction · mover presupuesto entre sobres", () => {
  const payload = {
    desdeCategoryId: UUID_A,
    desdeName: "Transporte",
    hastaCategoryId: UUID_B,
    hastaName: "Comida",
    amount: 40_000,
    currency: "CRC",
    periodMonth: 8,
    periodYear: 2026,
  };

  it("traduce el payload de la tarjeta al del servicio, con el período armado", async () => {
    const res = await confirmMoveBudgetAction(payload);
    expect(res.ok).toBe(true);
    const args = moverPresupuestoEntreSobres.mock.calls[0]![0] as Record<string, unknown>;
    expect(args).toMatchObject({
      desdeCategoryId: UUID_A,
      hastaCategoryId: UUID_B,
      // La tarjeta habla de `amount`; el servicio, de `monto`. Si esa traducción se rompe,
      // el servicio recibe `undefined` y mueve cero — en silencio.
      monto: 40_000,
      currency: "CRC",
    });
    expect(args.period).toMatchObject({ year: 2026, month: 8 });
  });

  it("rechaza mover un sobre a sí mismo sin tocar el servicio", async () => {
    // Sería un no-op que igual dispararía dos escrituras y dos entradas en el contador de
    // ediciones tardías.
    const res = await confirmMoveBudgetAction({ ...payload, hastaCategoryId: UUID_A });
    expect(res.ok).toBe(false);
    expect(moverPresupuestoEntreSobres).not.toHaveBeenCalled();
  });

  it("propaga el motivo del rechazo del servicio", async () => {
    moverPresupuestoEntreSobres.mockResolvedValueOnce({
      ok: false,
      message: "Transporte no tiene tanto presupuesto para ceder.",
    });
    const res = await confirmMoveBudgetAction(payload);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("no tiene tanto presupuesto");
  });
});

describe("confirmSetDcaAction · fijar el aporte mensual", () => {
  it("pasa holdingId y monto en ese orden posicional", async () => {
    // El destino recibe dos POSICIONALES, no un objeto: invertirlos no da error de tipo si
    // ambos fueran del mismo tipo, y acá se fija el contrato.
    const res = await confirmSetDcaAction({ holdingId: UUID_A, monthlyContribution: 50_000 });
    expect(res.ok).toBe(true);
    expect(setHoldingDcaAction).toHaveBeenCalledWith(UUID_A, 50_000);
  });

  it("admite 0 (apagar el aporte) — es un valor legítimo, no un vacío", async () => {
    const res = await confirmSetDcaAction({ holdingId: UUID_A, monthlyContribution: 0 });
    expect(res.ok).toBe(true);
    expect(setHoldingDcaAction).toHaveBeenCalledWith(UUID_A, 0);
  });
});

describe("confirmDebtExtraPaymentAction · abono extra a capital", () => {
  const payload = { debtId: UUID_A, amount: 100_000, paymentDate: "2026-08-09" };

  it("va como EXTRAORDINARIO: amount 0 y el monto en extraAmount", async () => {
    // Meterlo en `amount` lo registraría como la cuota del mes y distorsionaría el plan de
    // pago. Es la distinción entera de esta acción y no se ve en ninguna otra prueba.
    const res = await confirmDebtExtraPaymentAction(payload);
    expect(res.ok).toBe(true);
    expect(reportPaymentAction.mock.calls[0]![0]).toMatchObject({
      debtId: UUID_A,
      amount: 0,
      extraAmount: 100_000,
      kind: "extraordinario",
      paymentDate: "2026-08-09",
    });
  });

  it("manda la moneda NATIVA de la deuda cuando la IA no la trae (B1: nunca omite)", async () => {
    await confirmDebtExtraPaymentAction(payload);
    expect(reportPaymentAction.mock.calls[0]![0]).toMatchObject({ currency: "CRC" });
  });

  it("usa la que sí viene cuando la IA la extrajo", async () => {
    await confirmDebtExtraPaymentAction({ ...payload, currency: "USD" });
    expect(reportPaymentAction.mock.calls[0]![0]).toMatchObject({ currency: "USD" });
  });
});

describe("forgetMemoryFactAction · 'olvidá eso' llega a archivar de verdad", () => {
  it("archiva el hecho que la tarjeta tenía a la vista", async () => {
    const res = await forgetMemoryFactAction({ id: "mem-1" });
    expect(res.ok).toBe(true);
    expect(archiveFact).toHaveBeenCalledWith("mem-1");
  });

  it("acepta también el id suelto (es como lo manda la tarjeta del chat)", async () => {
    const res = await forgetMemoryFactAction("mem-2");
    expect(res.ok).toBe(true);
    expect(archiveFact).toHaveBeenCalledWith("mem-2");
  });

  it("sin id no toca el store", async () => {
    const res = await forgetMemoryFactAction({});
    expect(res.ok).toBe(false);
    expect(archiveFact).not.toHaveBeenCalled();
  });

  it("si el store LANZA, devuelve error legible en vez de colgar la tarjeta", async () => {
    archiveFact.mockRejectedValueOnce(new Error("boom"));
    const res = await forgetMemoryFactAction({ id: "mem-3" });
    expect(res.ok).toBe(false);
    expect(res.message).toBeTruthy();
  });
});

describe("las cuatro comparten el mismo contrato de error", () => {
  const casos = [
    ["adjust_budget", () => confirmAdjustBudgetAction({}), setEnvelopeBudgetAction],
    ["move_budget", () => confirmMoveBudgetAction({}), moverPresupuestoEntreSobres],
    ["set_dca", () => confirmSetDcaAction({}), setHoldingDcaAction],
    ["debt_extra_payment", () => confirmDebtExtraPaymentAction({}), reportPaymentAction],
  ] as const;

  it("un payload vacío nunca llega al destino y devuelve, no lanza", async () => {
    for (const [nombre, ejecutar, destino] of casos) {
      const res = await ejecutar();
      expect(res.ok, nombre).toBe(false);
      expect(destino, nombre).not.toHaveBeenCalled();
      vi.clearAllMocks();
    }
  });

  it("si el destino LANZA, se devuelve un error legible en vez de propagar la excepción", async () => {
    // Estas acciones corren desde una tarjeta del chat: una excepción sin atrapar deja la
    // tarjeta colgada en "Aplicando…" para siempre.
    setEnvelopeBudgetAction.mockRejectedValueOnce(new Error("boom"));
    const res = await confirmAdjustBudgetAction({
      categoryId: UUID_A,
      name: "Comida",
      amount: 1,
      currency: "CRC",
      periodMonth: 8,
      periodYear: 2026,
    });
    expect(res.ok).toBe(false);
    expect(res.message).toBeTruthy();
  });
});
