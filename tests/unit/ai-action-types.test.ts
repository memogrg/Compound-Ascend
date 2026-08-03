/**
 * Los tipos nuevos tienen que ATRAVESAR el parseo: si `parseAction` no los reconoce, el bloque
 * ```action``` del modelo se descarta en silencio y la tarjeta nunca sale.
 */
import { describe, it, expect } from "vitest";
import { parseAction } from "@/lib/ai/types";

const bloque = (json: string) => `Te conviene esto.\n\n\`\`\`action\n${json}\n\`\`\``;

describe("parseAction · las acciones que nacen de un consejo", () => {
  it("reconoce set_dca y deja el texto limpio", () => {
    const out = parseAction(
      bloque('{"type":"set_dca","payload":{"symbol":"VOO","monthlyContribution":200}}'),
    );
    expect(out.action?.type).toBe("set_dca");
    expect(out.action?.payload).toEqual({ symbol: "VOO", monthlyContribution: 200 });
    expect(out.reply).toBe("Te conviene esto.");
    expect(out.reply).not.toContain("```");
  });

  it("reconoce adjust_budget", () => {
    const out = parseAction(bloque('{"type":"adjust_budget","payload":{"name":"Restaurantes","amount":150000}}'));
    expect(out.action?.type).toBe("adjust_budget");
  });

  it("reconoce debt_extra_payment", () => {
    const out = parseAction(bloque('{"type":"debt_extra_payment","payload":{"name":"Tarjeta","amount":100000}}'));
    expect(out.action?.type).toBe("debt_extra_payment");
  });

  it("los tipos viejos siguen funcionando", () => {
    for (const t of ["create_transaction", "create_goal", "create_price_alert"]) {
      expect(parseAction(bloque(`{"type":"${t}","payload":{}}`)).action?.type).toBe(t);
    }
  });

  it("un tipo inventado se descarta pero el texto se conserva", () => {
    const out = parseAction(bloque('{"type":"transferir_plata","payload":{"amount":999}}'));
    expect(out.action).toBeNull();
    expect(out.reply).toBe("Te conviene esto.");
  });
});
