import { describe, it, expect } from "vitest";
import { scopeForIntent, FETCH_INTENTS_LAZY } from "@/lib/ai/lazy-context";

describe("scopeForIntent · contexto perezoso (rutear primero, construir solo lo necesario)", () => {
  it("lecturas frescas (saldo/sobres/movimientos/listar/puedo_gastar) → SIN contexto ni toolContext", () => {
    for (const intent of FETCH_INTENTS_LAZY) {
      const s = scopeForIntent(intent);
      expect(s.context).toBeNull(); // no se arma el FinancialContext
      expect(s.tool).toEqual({ debts: false, goals: false, numbers: false });
    }
  });

  it("gasto/ingreso/gasto_categoria/flujo_libre → solo bloques BARATOS (sin patrimonio ni portfolio)", () => {
    for (const intent of ["gasto_mes", "ingreso_mes", "gasto_categoria", "flujo_libre"]) {
      const s = scopeForIntent(intent);
      expect(s.context).toEqual({}); // {} = solo lo barato; NO portfolio ni patrimonio
      expect(s.context?.portfolio).toBeUndefined();
      expect(s.context?.patrimonio).toBeUndefined();
    }
  });

  it("números patrimoniales → toolContext.numbers, sin ctx pesado", () => {
    for (const intent of ["numero_seguridad", "numero_independencia", "numero_libertad"]) {
      const s = scopeForIntent(intent);
      expect(s.context).toBeNull();
      expect(s.tool.numbers).toBe(true);
    }
  });

  it("inversiones/mercado → portfolio (precios en vivo); NADA de eso para lo demás", () => {
    expect(scopeForIntent("resumen_inversiones").context).toEqual({ portfolio: true });
    expect(scopeForIntent("datos_mercado").context).toEqual({ portfolio: true });
    // una consulta de ingreso NUNCA trae portfolio (el costo dominante)
    expect(scopeForIntent("ingreso_mes").context).not.toHaveProperty("portfolio");
  });

  it("defensa_fondo: colchón necesita patrimonio (mesesDeColchon); emergencia/paz solo defense", () => {
    expect(scopeForIntent("defensa_fondo", { focus: "colchon" }).context).toEqual({ patrimonio: true, defense: true });
    expect(scopeForIntent("defensa_fondo", { focus: "emergencia" }).context).toEqual({ defense: true });
  });

  it("metas → toolContext.goals; cuota_deuda → toolContext.debts; ninguno arma portfolio/patrimonio", () => {
    const metas = scopeForIntent("metas");
    expect(metas.context).toBeNull();
    expect(metas.tool.goals).toBe(true);
    const deuda = scopeForIntent("cuota_deuda");
    expect(deuda.context).toBeNull();
    expect(deuda.tool.debts).toBe(true);
  });

  it("informe_inversion (carril deep) → portfolio+patrimonio+defensa y deudas/números; SIN flavor ni metas", () => {
    const s = scopeForIntent("informe_inversion");
    expect(s.context).toEqual({ portfolio: true, patrimonio: true, defense: true });
    expect(s.context?.flavor).toBeUndefined(); // flavor solo lo usa el LLM; el informe es plantilla
    expect(s.tool).toEqual({ debts: true, goals: false, numbers: true });
    expect(s.tool.goals).toBe(false); // el paquete de evidencia no consume metas → no se pagan
  });

  it("intent DESCONOCIDO → contexto completo (seguro, nunca degrada)", () => {
    const s = scopeForIntent("algo_raro");
    expect(s.context).toEqual({ patrimonio: true, portfolio: true, defense: true, flavor: true });
    expect(s.tool).toEqual({ debts: true, goals: true, numbers: true });
  });
});
