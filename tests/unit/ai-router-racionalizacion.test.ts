import { describe, it, expect } from "vitest";
import { matchIntent } from "@/lib/ai/router";

/**
 * Paso 3.11 — el guard de RACIONALIZACIÓN. Un hábito racionalizado ("es mi único gusto", "gasto un
 * montón en X", "me lo merezco") NO es una consulta de dato: `matchIntent` devuelve null → el turno
 * escala al LLM + `garantizarConfrontacion`, en vez de que `gasto_mes` conteste el TOTAL con plantilla.
 * El test LOCKEA las dos mitades: racionalizaciones → null, y que la optimización de dato NO se rompa.
 */
describe("matchIntent · guard de racionalización (Paso 3.11)", () => {
  it("la probe de restaurantes YA NO cae en gasto_mes (el bug) → null (→ LLM + garantía)", () => {
    // Antes del guard esto devolvía { intent: 'gasto_mes' } y el router contestaba el total pelado.
    expect(
      matchIntent(
        "Sé que gasto un montón en restaurantes pero es mi único gusto y no lo pienso dejar.",
      ),
    ).toBeNull();
  });

  it("las familias de racionalización escalan al LLM (null)", () => {
    const racionalizaciones = [
      "Me compré otro gadget de ₡180.000, me lo merezco después del mes que tuve. ¿Todo bien, no?",
      "Me quiero gastar todo el aguinaldo en un viaje, total es plata extra.",
      "Es mi único gusto y no lo pienso dejar.",
      "Gasto de más en delivery, lo sé.",
      "Sé que gasto mucho en salidas pero me lo merezco.",
      "El café es mi cable a tierra, no lo voy a dejar.",
    ];
    for (const m of racionalizaciones) {
      expect(matchIntent(m), `debería escalar: "${m}"`).toBeNull();
    }
  });

  it("un mensaje MIXTO (cita cifra Y racionaliza) también escala (LLM cita y confronta)", () => {
    expect(matchIntent("¿Cuánto gasté en restaurantes? Sé que es mi único gusto.")).toBeNull();
  });

  it("NO rompe la optimización: las consultas de dato PURAS mantienen su intent determinista", () => {
    // El guard no debe tocar ninguna de estas — es el corazón del carril barato.
    expect(matchIntent("¿Cuánto gasté este mes?")?.intent).toBe("gasto_mes");
    expect(matchIntent("¿Cuánto gasto por mes en promedio?")?.intent).toBe("gasto_mes");
    expect(matchIntent("¿Cuánto gasté en julio?")?.intent).toBe("consulta_transacciones");
    expect(matchIntent("¿Cuánto le gasté a Walmart?")?.intent).toBe("consulta_transacciones");
    expect(matchIntent("¿Cuánto gasté en restaurantes?")?.intent).toBe("consulta_transacciones");
    // "Mostrame mis gastos de restaurantes" ya iba al LLM (null) antes del guard: se mantiene.
    expect(matchIntent("Mostrame mis gastos de restaurantes")).toBeNull();
  });
});
