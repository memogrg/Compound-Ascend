/**
 * ACCESO A LOS ASISTENTES: nunca puede quedar sin punto de entrada.
 *
 * El asistente no es solo el alta inicial — también es la puerta para MODIFICAR
 * la configuración. Un usuario con todo configurado es exactamente el que va a
 * querer entrar a cambiar un monto, así que "ya terminaste" no puede significar
 * "ya no podés volver".
 *
 * Se protegen dos cosas distintas:
 *  1. El MOTOR: `getSetupProgress` describe siempre a los cuatro asistentes,
 *     esté la configuración vacía o completa. Nunca devuelve una lista corta.
 *  2. Las SUPERFICIES: existe una entrada estable fuera del panel (ruta índice +
 *     navegación web y móvil), para no depender de una tarjeta del dashboard.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { deriveSetupProgress, setupOverall } from "@/modules/setup/engine/progress";
import type { SetupSnapshot } from "@/modules/setup/types";

const VACIO: SetupSnapshot = {
  currency: "CRC",
  period: { year: 2026, month: 8 },
  incomes: [],
  incomeMonthly: 0,
  jars: [],
  sobres: [],
  budgetedMonthly: 0,
  debts: [],
  goals: [],
  emergency: null,
  peace: null,
  essentialMonthly: 0,
  policies: [],
  holdings: [],
  desiredLifestyle: null,
};

/** Snapshot con los cuatro asistentes RESUELTOS (el caso "ya terminé"). */
const COMPLETO: SetupSnapshot = {
  ...VACIO,
  incomes: [
    {
      id: "inc-1",
      name: "Salario",
      amount: 1_000_000,
      amountMonthly: 1_000_000,
      currency: "CRC",
      incomeType: "activo",
      frequency: "mensual",
      recurrent: true,
    },
  ],
  incomeMonthly: 1_000_000,
  sobres: [
    {
      id: "cat-1",
      name: "Supermercado",
      jarId: "jar-1",
      jarName: "Alimentación",
      jarKey: "g_alimentacion",
      isSystem: false,
      isFavorite: true,
      isEssential: true,
      icon: null,
      color: null,
      budget: 300_000,
      budgetCurrency: "CRC",
      locked: false,
    },
  ],
  budgetedMonthly: 300_000,
  goals: [
    {
      id: "g1",
      name: "Viaje",
      kind: "meta",
      goalType: null,
      targetAmount: 500_000,
      currentAmount: 0,
      monthlyContribution: 50_000,
      recurrence: "ninguna",
      currency: "CRC",
    },
  ],
  emergency: {
    target: 500_000,
    current: 500_000,
    gap: 0,
    progressPct: 1,
    covered: true,
    recommendedMonthly: 0,
    registered: true,
  },
  peace: {
    target: 900_000,
    current: 900_000,
    gap: 0,
    progressPct: 1,
    covered: true,
    recommendedMonthly: 0,
    months: 3,
    blockedByEmergency: false,
    registered: true,
  },
  desiredLifestyle: { amount: 900_000, currency: "CRC" },
};

describe("el motor siempre describe a los cuatro asistentes", () => {
  it("con la configuración VACÍA devuelve los cuatro", () => {
    expect(deriveSetupProgress(VACIO)).toHaveLength(4);
  });

  it("con la configuración COMPLETA devuelve los cuatro, no una lista vacía", () => {
    // Terminar la configuración no puede hacer desaparecer los asistentes: es
    // justamente cuando se entra a MODIFICAR.
    const progreso = deriveSetupProgress(COMPLETO);
    expect(progreso).toHaveLength(4);
    expect(setupOverall(progreso).allReady).toBe(true);
    expect(progreso.every((p) => p.status === "listo")).toBe(true);
  });

  it("cada asistente conserva su ruta web y móvil, esté listo o no", () => {
    for (const snapshot of [VACIO, COMPLETO]) {
      for (const p of deriveSetupProgress(snapshot)) {
        expect(p.href).toBe(`/configurar/${p.id}`);
        expect(p.mobileHref).toBe(`/m/configurar/${p.id}`);
      }
    }
  });
});

// ── Superficies: la entrada no puede depender de una tarjeta del panel ───────

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

describe("hay una entrada estable fuera del panel", () => {
  it("existe la ruta índice /configurar y lista los cuatro", () => {
    const src = read("src", "app", "(dashboard)", "configurar", "page.tsx");
    expect(src).toContain("getSetupProgress");
    expect(src).toContain("SetupHub");
  });

  it("existe su equivalente móvil /m/configurar", () => {
    const src = read("src", "app", "(mobile)", "m", "(app)", "configurar", "page.tsx");
    expect(src).toContain("getSetupProgress");
    expect(src).toContain("mobile");
  });

  it("la navegación web ofrece el destino de forma permanente", () => {
    const nav = read("src", "lib", "constants", "nav.ts");
    expect(nav).toContain('href: "/configurar"');
  });

  it("el menú móvil ofrece el destino de forma permanente", () => {
    const menu = read("src", "app", "(mobile)", "m", "components", "mobile-menu.tsx");
    expect(menu).toContain('href: "/m/configurar"');
  });

  it("Configuración (web y móvil) también lleva a los asistentes", () => {
    expect(read("src", "app", "(dashboard)", "configuracion", "page.tsx")).toContain("/configurar");
    expect(read("src", "app", "(mobile)", "m", "(app)", "perfil", "page.tsx")).toContain(
      "/m/configurar",
    );
  });
});

/** Código sin comentarios: lo que se mide es el JSX, no lo que cuenta la doc. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("el hub nunca se esconde del todo", () => {
  const hub = read("src", "modules", "setup", "components", "setup-hub.tsx");

  it("con todo listo pinta el acceso compacto, no `null`", () => {
    // La rama `allReady` devuelve el acceso permanente. Si alguien la cambiara
    // por un `return null`, este test lo dice.
    expect(hub).toContain("allReady");
    expect(hub).toContain("Ajustar mi configuración");
    expect(code(hub)).not.toMatch(/if \(allReady\)\s*(\{\s*)?return null/);
  });

  it("los cuatro accesos se pintan sin depender de un desplegable", () => {
    // Antes el acceso compacto vivía dentro de un desplegable: los cuatro
    // enlaces existían, pero había que descubrir el toggle para verlos.
    expect(code(hub)).not.toContain("<details");
    expect(code(hub)).not.toContain("<summary");
  });

  it("el acceso compacto enlaza a los CUATRO, no solo al que falta", () => {
    expect(hub).toContain("progress.map");
    expect(hub).toContain("setup-hub-chip");
  });

  it("el panel monta el hub en sus DOS ramas, con datos y sin datos", () => {
    // El usuario sin datos es el que MÁS necesita los asistentes: la rama del
    // estado vacío devolvía antes que el hub y lo dejaba sin ninguna puerta.
    const src = code(read("src", "app", "(dashboard)", "dashboard", "page.tsx"));
    expect(src.match(/<SetupHub\b/g) ?? []).toHaveLength(2);
    // Y el CTA principal del estado vacío lleva a los asistentes.
    expect(src).toContain('href="/configurar"');
  });
});
