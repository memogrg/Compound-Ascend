/**
 * Muro de plan del layout móvil: decide con el plan EFECTIVO (RPC `effective_plan`), la misma
 * fuente que /api/account/plan. Un miembro activo del hogar de un titular Max+ no cae en
 * /m/sin-plan (B-2). Best-effort: si la RPC falla o el cliente no se puede crear, no se bloquea.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const estado = vi.hoisted(() => ({
  rpc: { data: "max", error: null } as { data: unknown; error: { message: string } | null },
  clienteLanza: false,
  pathname: "/m/gastos",
  llamadas: [] as { fn: string; args: unknown }[],
}));

const Redirigido = vi.hoisted(
  () =>
    class Redirigido extends Error {
      constructor(public destino: string) {
        super(`redirect ${destino}`);
      }
    },
);

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redirigido(destino);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": estado.pathname }),
}));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (estado.clienteLanza) throw new Error("sin cookies");
    return {
      rpc: async (fn: string, args: unknown) => {
        estado.llamadas.push({ fn, args });
        return estado.rpc;
      },
      from: () => {
        throw new Error("el muro no debe leer profiles directo");
      },
    };
  },
}));
vi.mock("@/lib/legal/aceptacion", () => ({ aceptacionPendiente: async () => false }));
vi.mock("@/modules/financial-base", () => ({
  getPrimaryCurrency: async () => "CRC",
  getDisplayCurrency: async () => "CRC",
}));
vi.mock("@/lib/time/user-time", () => ({
  getUserTimezone: async () => null,
  knownUserTz: async () => null,
}));
const nada = vi.hoisted(() => () => null);
vi.mock("@/components/legal/aceptar-terminos-banner", () => ({ AceptarTerminosBanner: nada }));
vi.mock("@/components/tz/timezone-sync", () => ({ TimezoneSync: nada }));
vi.mock("@/components/tz/timezone-context", () => ({ TimezoneProvider: nada }));
vi.mock("@/components/layout/currency-context", () => ({ CurrencyProvider: nada }));
vi.mock("@/app/(mobile)/m/components/form-kit/toast", () => ({ ToastProvider: nada }));
vi.mock("@/app/(mobile)/m/components/app-lock-overlay", () => ({ AppLockOverlay: nada }));
vi.mock("@/app/(mobile)/m/components/android-back-handler", () => ({
  AndroidBackHandler: nada,
}));
vi.mock("@/app/(mobile)/m/components/widget-snapshot-writer", () => ({
  WidgetSnapshotWriter: nada,
}));
vi.mock("@/app/(mobile)/m/components/mobile-rhythm-nudge", () => ({ MobileRhythmNudge: nada }));
vi.mock("@/app/(mobile)/m/components/purchases-bootstrap", () => ({
  PurchasesBootstrap: nada,
}));

import MobileAppLayout from "@/app/(mobile)/m/(app)/layout";

async function destino(): Promise<string | null> {
  try {
    await MobileAppLayout({ children: null });
    return null;
  } catch (e) {
    if (e instanceof Redirigido) return e.destino;
    throw e;
  }
}

beforeEach(() => {
  estado.rpc = { data: "max", error: null };
  estado.clienteLanza = false;
  estado.pathname = "/m/gastos";
  estado.llamadas = [];
});

describe("muro de plan del layout móvil", () => {
  it("efectivo max (heredado del hogar) → no va a /m/sin-plan", async () => {
    expect(await destino()).toBeNull();
    expect(estado.llamadas).toEqual([{ fn: "effective_plan", args: { p_user: "u1" } }]);
  });

  it("efectivo ninguno → /m/sin-plan", async () => {
    estado.rpc = { data: "ninguno", error: null };
    expect(await destino()).toBe("/m/sin-plan");
  });

  it("si la RPC falla → no bloquea", async () => {
    estado.rpc = { data: null, error: { message: "boom" } };
    expect(await destino()).toBeNull();
  });

  it("si el cliente no se puede crear → no bloquea", async () => {
    estado.clienteLanza = true;
    expect(await destino()).toBeNull();
  });
});
