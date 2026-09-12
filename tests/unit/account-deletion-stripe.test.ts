/**
 * Borrar la cuenta tiene que CORTAR EL COBRO.
 *
 * Antes, `deleteAccountCore` no hablaba con Stripe: la cuenta desaparecía y la
 * suscripción seguía facturando contra un usuario que ya no existía — y, peor, el
 * webhook del cobro no encontraba a quién aplicárselo. Estos casos fijan las
 * cuatro decisiones del paso 0.
 *
 * Lo que importa no es el driver sino el ORDEN y el ABORTO: Stripe va antes que
 * el `deleteUser`, porque el cascade se lleva el perfil con los ids de
 * facturación; y si Stripe falla de verdad, no se borra nada.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/** El perfil que "hay en la base". Cada caso lo reescribe. */
let perfil: Record<string, unknown> | null = null;

const deleteUser = vi.fn(async () => ({ error: null }));
const rpc = vi.fn(async () => ({ data: [], error: null }));

/**
 * Supabase service-role mínimo: solo los verbos que toca el borrado. `profiles`
 * devuelve el perfil del caso; el resto de las tablas, vacío (al no haber hogar,
 * `resolveDeletionContext` resuelve role='solo' y no hay purge ni reassign).
 */
function clienteFalso() {
  const tabla = (nombre: string) => {
    const cadena = {
      select: () => cadena,
      eq: () => cadena,
      limit: () => cadena,
      delete: () => cadena,
      update: () => cadena,
      async maybeSingle() {
        return { data: nombre === "profiles" ? perfil : null, error: null };
      },
      then(res: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(res({ data: [], error: null }));
      },
    };
    return cadena;
  };
  return {
    from: tabla,
    rpc,
    storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({}) }) },
    auth: { admin: { deleteUser } },
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => clienteFalso(),
}));

const cancel = vi.fn(async (id: string) => ({ id, status: "canceled" }));
const del = vi.fn(async (id: string) => ({ id, deleted: true }));
/** null simula un entorno SIN STRIPE_SECRET_KEY. */
let stripeActivo = true;

vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => (stripeActivo ? { subscriptions: { cancel }, customers: { del } } : null),
}));

import { deleteAccountCore } from "@/modules/account/services/account-deletion-service";
import { AppError } from "@/lib/errors";

/** Un error tal como lo tira el SDK de Stripe. */
function errorStripe(code: string, statusCode: number) {
  return Object.assign(new Error(`stripe: ${code}`), { code, statusCode });
}

const USER = "u-1";

beforeEach(() => {
  vi.clearAllMocks();
  stripeActivo = true;
  perfil = { stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1" };
});

describe("deleteAccountCore · paso 0 (Stripe)", () => {
  it("con suscripción y cliente: cancela, después borra el cliente, y lo reporta", async () => {
    const res = await deleteAccountCore(USER);

    expect(cancel).toHaveBeenCalledWith("sub_1");
    expect(del).toHaveBeenCalledWith("cus_1");
    // El orden importa: cancelar la suscripción antes de que el cliente deje de existir.
    expect(cancel.mock.invocationCallOrder[0]!).toBeLessThan(del.mock.invocationCallOrder[0]!);

    expect(res.cleanup).toContain("stripe_subscription:cancelled");
    expect(res.cleanup).toContain("stripe_customer:deleted");
    expect(deleteUser).toHaveBeenCalledWith(USER);
  });

  it("Stripe va ANTES del deleteUser: el cascade se lleva los ids de facturación", async () => {
    await deleteAccountCore(USER);
    expect(cancel.mock.invocationCallOrder[0]!).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0]!,
    );
  });

  it("resource_missing al cancelar: ya estaba cancelada, sigue con el cliente", async () => {
    cancel.mockRejectedValueOnce(errorStripe("resource_missing", 404));

    const res = await deleteAccountCore(USER);

    expect(res.cleanup).toContain("stripe_subscription:inexistente");
    expect(del).toHaveBeenCalledWith("cus_1");
    expect(deleteUser).toHaveBeenCalled();
  });

  it("un fallo REAL de Stripe aborta: no se borra el usuario", async () => {
    cancel.mockRejectedValueOnce(errorStripe("api_error", 500));

    await expect(deleteAccountCore(USER)).rejects.toBeInstanceOf(AppError);
    expect(del).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("el mensaje del fallo es accionable, no un genérico", async () => {
    cancel.mockRejectedValueOnce(errorStripe("api_error", 500));

    const err = await deleteAccountCore(USER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toMatch(/cancelar tu suscripci[óo]n/i);
  });

  it("sin STRIPE_SECRET_KEY: no toca Stripe y borra igual", async () => {
    stripeActivo = false;

    const res = await deleteAccountCore(USER);

    expect(cancel).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(res.cleanup.some((c) => c.startsWith("stripe_"))).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith(USER);
  });

  it("cuenta que nunca pagó: sin ids, Stripe ni se consulta", async () => {
    perfil = { stripe_subscription_id: null, stripe_customer_id: null };

    const res = await deleteAccountCore(USER);

    expect(cancel).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(res.cleanup.some((c) => c.startsWith("stripe_"))).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith(USER);
  });
});
