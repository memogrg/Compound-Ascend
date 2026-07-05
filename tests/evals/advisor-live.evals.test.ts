import { describe, it, expect } from "vitest";
import { financeChat, type FinancialContext } from "@/lib/ai/orchestrator";
import type { ChatMessage } from "@/lib/ai/provider";

/**
 * EVALS VIVOS — APAGADOS POR DEFECTO.
 *
 * Replayean preguntas reales del chat contra el proveedor REAL (getProvider() por
 * defecto). NO corren en CI ni en `npm run test`: se activan con RUN_LIVE_EVALS=1
 * cuando decidamos el motor (Ola 2). Hoy cada caso solo hace un smoke del pipeline;
 * el assert "dorado" (criterio semántico) queda como TODO(Ola 2) documentado.
 */
const RUN_LIVE = !!process.env.RUN_LIVE_EVALS;

const ask = (content: string): ChatMessage[] => [{ role: "user", content }];

// Contexto con métricas REALES pobladas, como en la conversación que falló.
const CTX: FinancialContext = {
  currency: "CRC",
  name: "Memo",
  netWorth: 105_040_035,
  portfolioValue: 61_581_512,
  investableWealth: 13_000_000,
  numeroDeLibertad: 290_400_000,
};

describe.skipIf(!RUN_LIVE)("evals VIVOS · asesor real (RUN_LIVE_EVALS=1)", () => {
  it("valor en inversiones → da la cifra real, nunca 'no tengo acceso'", async () => {
    const { reply } = await financeChat(ask("¿cuál es mi valor en inversiones actualmente?"), CTX);
    expect(reply).toBeTypeOf("string");
    // TODO(Ola 2): la respuesta debe citar el portfolioValue del contexto (≈ ₡61,6M)
    //   y NO decir "no tengo acceso":
    //   expect(reply).toContain("61"); expect(reply.toLowerCase()).not.toContain("no tengo acceso");
  });

  it("proyección a 15 años @10% → usa el patrimonio del contexto, no lo inventa", async () => {
    const { reply } = await financeChat(ask("hazme una proyección a 15 años al 10%"), CTX);
    expect(reply).toBeTypeOf("string");
    // TODO(Ola 2): debe partir del patrimonio invertible/portafolio del contexto como monto inicial,
    //   NO inventar un patrimonio inicial arbitrario.
  });

  it("tabla de aportes y crecimiento anual → usa la herramienta, no improvisa", async () => {
    const { reply } = await financeChat(ask("dame una tabla de aportes y crecimiento anual"), CTX);
    expect(reply).toBeTypeOf("string");
    // TODO(Ola 2): los números deben coincidir con projectInvestment (proyectar_inversion),
    //   no ser cifras improvisadas por el modelo.
  });

  it("consistencia entre turnos → no confunde Número de Libertad con aporte mensual", async () => {
    const first = await financeChat(ask("¿cuál es mi número de libertad?"), CTX);
    const second = await financeChat(
      [
        ...ask("¿cuál es mi número de libertad?"),
        { role: "assistant", content: first.reply },
        ...ask("¿y cuál es mi aporte mensual?"),
      ],
      CTX,
    );
    expect(second.reply).toBeTypeOf("string");
    // TODO(Ola 2): el turno 2 NO debe repetir el Número de Libertad como si fuera el aporte mensual;
    //   ambos conceptos se mantienen separados entre turnos.
  });

  it("identidad → responde 'My Agent C+', nunca 'Ascend AI' ni 'Compound Ascend'", async () => {
    const { reply } = await financeChat(ask("¿cómo te llamás?"), CTX);
    expect(reply).toBeTypeOf("string");
    // TODO(Ola 2): expect(reply).toContain("My Agent C+");
    //   expect(reply).not.toMatch(/Ascend AI|Compound Ascend/i);
  });
});
