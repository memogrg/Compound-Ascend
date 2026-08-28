import { describe, it, expect, vi } from "vitest";
import {
  completarHorizonte,
  deflectoSobre,
  horizonteFaltante,
  plantillaRestaurantes,
} from "@/lib/ai/completado";
import { garantizarConfrontacion } from "@/lib/ai/orchestrator";
import type { AIChatResponse } from "@/lib/ai/types";
import type { FinancialContext } from "@/lib/ai/system-prompt";
import type { AIProvider } from "@/lib/ai/provider";
import type { DebtProjection, FundEta, GoalLever } from "@/lib/ai/context-levers";

const CRC = "CRC";
const DEUDA: DebtProjection = {
  name: "Tarjeta Oro",
  extra: 120000,
  monthsSaved: 56,
  interestSaved: 961229,
  currency: CRC,
};
const FONDO: FundEta = { monthsToTarget: 11, etaLabel: "julio 2026", aporte: 50000, currency: CRC };
const META: GoalLever = {
  name: "Viaje a Japón",
  target: 1200000,
  currency: CRC,
  monthlyActual: 50000,
  monthsAtPace: 24,
  etaAtPace: "enero 2028",
};
const resp = (reply: string, action: AIChatResponse["action"] = null): AIChatResponse => ({
  reply,
  action,
});

// ── deflectoSobre ─────────────────────────────────────────────────────────────────────────────────
describe("deflectoSobre", () => {
  const foco = { name: "Restaurantes", monthly: 80000 };
  it("citó la cifra del sobre (₡80.000) → NO deflectó", () => {
    expect(deflectoSobre("Los restaurantes te comen ₡80.000 al mes, ponele un tope.", foco)).toBe(
      false,
    );
  });
  it("respondió el total (₡400.000) y omitió el sobre → deflectó", () => {
    expect(deflectoSobre("Tu gasto mensual ronda ₡400.000.", foco)).toBe(true);
  });
  it("sin foco o sin reply → no deflexión (nada que garantizar)", () => {
    expect(deflectoSobre("cualquier cosa", undefined)).toBe(false);
    expect(deflectoSobre("", foco)).toBe(false);
  });
});

// ── completarHorizonte · DEUDA ──────────────────────────────────────────────────────────────────
describe("completarHorizonte · deuda", () => {
  const ctx: FinancialContext = { currency: CRC, debtProjections: [DEUDA] };
  it("cierre de deuda SIN horizonte → agrega meses antes + interés (grounded del engine)", () => {
    const out = completarHorizonte(resp("Abonale ₡120.000 extra a la Tarjeta Oro este mes."), ctx);
    expect(out.reply).toContain("salís 56 meses antes");
    expect(out.reply).toContain("961229 CRC de interés");
  });
  it("inserta ANTES de la pregunta-CTA final (naturalidad)", () => {
    const out = completarHorizonte(resp("Abonale ₡120.000 a la Tarjeta Oro. ¿Lo aplico?"), ctx);
    expect(out.reply.endsWith("¿Lo aplico?")).toBe(true);
    expect(out.reply).toContain("56 meses antes");
    expect(out.reply.indexOf("56 meses antes")).toBeLessThan(out.reply.indexOf("¿Lo aplico?"));
  });
  it("señal 1 (interés ya citado) → NO doble-append", () => {
    const r = "Abonale a la Tarjeta Oro y ahorrás ~961229 CRC de interés.";
    expect(completarHorizonte(resp(r), ctx).reply).toBe(r);
  });
  it("señal 2 (conteo de meses ya citado) → NO doble-append", () => {
    const r = "Abonale a la Tarjeta Oro y salís como 56 meses antes.";
    expect(completarHorizonte(resp(r), ctx).reply).toBe(r);
  });
  it("señal 3 (frase genérica 'meses antes') → NO doble-append", () => {
    const r = "Abonale a la Tarjeta Oro para salir muchos meses antes de lo previsto.";
    expect(completarHorizonte(resp(r), ctx).reply).toBe(r);
  });
  it("acción estructurada debt_extra_payment dispara el completado aunque el verbo no esté en texto", () => {
    const out = completarHorizonte(
      resp("Es tu deuda más cara.", {
        type: "debt_extra_payment",
        payload: { debtName: "Tarjeta Oro" },
      }),
      ctx,
    );
    expect(out.reply).toContain("56 meses antes");
  });
  it("consulta sin cierre (sin verbo de abono ni acción) → no agrega", () => {
    const r = "¿Querés que veamos tu Tarjeta Oro con más detalle?";
    expect(completarHorizonte(resp(r), ctx).reply).toBe(r);
  });
  it("sin debtProjections en el contexto → no agrega", () => {
    const r = "Abonale ₡120.000 a la Tarjeta Oro.";
    expect(completarHorizonte(resp(r), { currency: CRC }).reply).toBe(r);
  });
});

// ── completarHorizonte · FONDO ──────────────────────────────────────────────────────────────────
describe("completarHorizonte · fondo", () => {
  const ctx: FinancialContext = { currency: CRC, fundEta: FONDO };
  it("cierre de fondo SIN horizonte → agrega la ETA del engine", () => {
    const out = completarHorizonte(resp("Apartá ₡50.000 al mes para tu fondo de emergencia."), ctx);
    expect(out.reply).toContain("queda cubierto para julio 2026 (11 meses)");
  });
  it("detecta el cierre por prosa 'automatizá un aporte' (VERBO_AHORRO ampliado, Paso A)", () => {
    // Antes del fix, "automatizá/aporte" no matcheaba VERBO_AHORRO → el fondo por prosa no se detectaba.
    const out = completarHorizonte(
      resp("Automatizá un aporte a tu fondo de emergencia para blindar tu patrimonio."),
      ctx,
    );
    expect(out.reply).toContain("queda cubierto para julio 2026 (11 meses)");
  });
  it("etaLabel ya presente → NO doble-append", () => {
    const r = "Apartá para tu fondo de emergencia y lo tenés para julio 2026.";
    expect(completarHorizonte(resp(r), ctx).reply).toBe(r);
  });
  it("conteo de meses ya presente → NO doble-append", () => {
    const r = "Apartá para tu fondo de emergencia, en 11 meses queda.";
    expect(completarHorizonte(resp(r), ctx).reply).toBe(r);
  });
  it("NO parte un número con separador de miles al insertar (bug 3.10 que cazó el spot-check)", () => {
    const c: FinancialContext = {
      currency: CRC,
      fundEta: { monthsToTarget: 1, etaLabel: "julio 2026", aporte: 550000, currency: CRC },
    };
    // cierre de fondo (por acción create_goal) que termina en un número con punto de miles + "?".
    const out = completarHorizonte(
      resp("Automatizá tu fondo de emergencia con un aporte mensual de ₡550.000?", {
        type: "create_goal",
        payload: { name: "Fondo de emergencia" },
      }),
      c,
    );
    expect(out.reply.endsWith("₡550.000?")).toBe(true); // el número quedó INTACTO, al final
    expect(out.reply).not.toContain("₡550. "); // no se partió en "₡550. … 000"
    expect(out.reply).toContain("cubierto para julio 2026 (1 mes)"); // singular, no "1 meses"
    // el horizonte va ANTES de la pregunta-cierre (naturalidad preservada)
    expect(out.reply.indexOf("cubierto para julio 2026")).toBeLessThan(
      out.reply.indexOf("Automatizá"),
    );
  });
  it("inserta ANTES de la pregunta cuando hay una oración previa real (sin partir el número)", () => {
    const c: FinancialContext = {
      currency: CRC,
      fundEta: { monthsToTarget: 3, etaLabel: "octubre 2026", aporte: 100000, currency: CRC },
    };
    const out = completarHorizonte(
      resp("Guardá para tu fondo de emergencia. ¿Creamos tu meta con ₡100.000?"),
      c,
    );
    expect(out.reply).toContain("₡100.000?");
    expect(out.reply).not.toContain("₡100. ");
    expect(out.reply).toContain("(3 meses)");
    expect(out.reply.startsWith("Guardá para tu fondo de emergencia.")).toBe(true);
  });
});

// ── completarHorizonte · META ───────────────────────────────────────────────────────────────────
describe("completarHorizonte · meta", () => {
  const ctx: FinancialContext = { currency: CRC, goals: [META] };
  it("cierre de meta SIN horizonte → agrega la ETA al ritmo actual", () => {
    const out = completarHorizonte(resp("Seguí aportando ₡50.000 a tu Viaje a Japón."), ctx);
    expect(out.reply).toContain("llegás a esa meta en enero 2028");
  });
  it("etaAtPace ya presente → NO doble-append", () => {
    const r = "Aportá a tu Viaje a Japón y a tu ritmo llegás en enero 2028.";
    expect(completarHorizonte(resp(r), ctx).reply).toBe(r);
  });
  it("meta sin etaAtPace → no hay horizonte que tejer", () => {
    const sinEta: GoalLever = { ...META, etaAtPace: undefined, monthsAtPace: undefined };
    const r = "Aportá a tu Viaje a Japón.";
    expect(completarHorizonte(resp(r), { currency: CRC, goals: [sinEta] }).reply).toBe(r);
  });
});

// ── precedencia: UN solo dominio ────────────────────────────────────────────────────────────────
describe("completarHorizonte · un solo dominio (precedencia deuda → fondo → meta)", () => {
  it("cierre de deuda con deuda+fondo en contexto → teje SOLO deuda", () => {
    const ctx: FinancialContext = { currency: CRC, debtProjections: [DEUDA], fundEta: FONDO };
    const out = completarHorizonte(resp("Abonale ₡120.000 a la Tarjeta Oro."), ctx);
    expect(out.reply).toContain("56 meses antes");
    expect(out.reply).not.toContain("julio 2026");
  });
  it("horizonteFaltante devuelve undefined cuando no hay cierre", () => {
    expect(
      horizonteFaltante("Buen día, ¿en qué te ayudo?", null, { currency: CRC }),
    ).toBeUndefined();
  });
});

// ── plantillaRestaurantes ───────────────────────────────────────────────────────────────────────
describe("plantillaRestaurantes", () => {
  const foco = { name: "Restaurantes", monthly: 80000 };
  it("confronta con la cifra del sobre + tope = mitad + destino grounded + cierra con paso", () => {
    const out = plantillaRestaurantes(foco, { currency: CRC, debtProjections: [DEUDA] });
    expect(out).toContain("₡80000 CRC/mes");
    expect(out).toContain("₡40000 CRC/mes (la mitad)"); // tope
    expect(out).toContain("₡40000 CRC que soltás"); // libera
    expect(out).toContain("tu Tarjeta Oro"); // destino prioritario
    expect(out).toContain("¿Lo probamos este mes?"); // paso
  });
  it("grounding-safe: tope y liberado = monto ÷ 2 (respaldados por el divisor del checker)", () => {
    const out = plantillaRestaurantes(foco, { currency: CRC });
    // el único número nuevo es 40000 = 80000/2 → grounded por ÷2; no aparece un total inventado.
    expect(out).toContain("tus ahorros"); // fallback de destino sin deuda/fondo
    expect(out).not.toContain("400000"); // no aparece el total inventado
    expect(out).not.toContain("400.000");
  });
  it("destino = fondo cuando no hay deuda pero sí fundEta", () => {
    expect(plantillaRestaurantes(foco, { currency: CRC, fundEta: FONDO })).toContain(
      "tu fondo de emergencia",
    );
  });
});

// ── garantizarConfrontacion (regen wrapper, provider inyectable) ────────────────────────────────
const foco = { name: "Restaurantes", monthly: 80000 };
const ctxFoco: FinancialContext = { currency: CRC, debtProjections: [DEUDA] };
const passthroughGuards = (p: AIChatResponse) => ({ bloqueado: false, reply: p.reply });
const fakeProvider = (text: string): AIProvider =>
  ({
    name: "fake",
    model: "fake",
    chat: vi.fn(),
    vision: vi.fn(),
    chatWithTools: vi.fn(async () => ({ text, tokensIn: 7, tokensOut: 3 })),
  }) as unknown as AIProvider;

const baseDeps = (provider: AIProvider, runSafetyGuards = passthroughGuards) => ({
  provider,
  systemBase: "SYS",
  messages: [{ role: "user" as const, content: "gasto un montón en restaurantes" }],
  toolset: [],
  toolContext: { debts: [], currency: CRC },
  runSafetyGuards,
});

describe("garantizarConfrontacion", () => {
  it("Tier A: el regen confronta (cita ₡80.000) → gana la respuesta del regen, con sus tokens", async () => {
    const provider = fakeProvider("Los restaurantes son ₡80000 CRC/mes, ponele un tope.");
    const out = await garantizarConfrontacion(foco, ctxFoco, baseDeps(provider));
    expect(out.response.reply).toContain("₡80000");
    expect(out.response.reply).not.toContain("es tu gusto"); // NO es la plantilla
    expect(out.tokensIn).toBe(7);
    expect(out.tokensOut).toBe(3);
    expect(provider.chatWithTools).toHaveBeenCalledTimes(1);
  });
  it("Tier B: el regen SIGUE deflectando (total) → plantilla determinista", async () => {
    const out = await garantizarConfrontacion(
      foco,
      ctxFoco,
      baseDeps(fakeProvider("Tu gasto ronda ₡400.000.")),
    );
    expect(out.response.reply).toContain("es tu gusto");
    expect(out.response.reply).toContain("₡40000 CRC/mes (la mitad)");
    expect(out.tokensIn).toBe(7); // los tokens del regen se contabilizan igual
  });
  it("Tier B: el regen se BLOQUEA por un guard de seguridad → plantilla (invariante intacto)", async () => {
    const blocked = () => ({ bloqueado: true, reply: "[bloqueado]" });
    const out = await garantizarConfrontacion(
      foco,
      ctxFoco,
      baseDeps(fakeProvider("Los restaurantes son ₡80000 CRC/mes."), blocked),
    );
    expect(out.response.reply).toContain("es tu gusto"); // no sale el regen bloqueado
  });
  it("re-pasa los guards de seguridad sobre la regeneración", async () => {
    const spy = vi.fn(passthroughGuards);
    const provider = fakeProvider("Los restaurantes son ₡80000 CRC/mes.");
    await garantizarConfrontacion(foco, ctxFoco, baseDeps(provider, spy));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].reply).toContain("₡80000"); // se juzgó la regeneración
  });
  it("el provider cae (throw) → Tier B directo, sin tokens (nunca degrada)", async () => {
    const provider = {
      name: "boom",
      model: "boom",
      chat: vi.fn(),
      vision: vi.fn(),
      chatWithTools: vi.fn(async () => {
        throw new Error("network");
      }),
    } as unknown as AIProvider;
    const out = await garantizarConfrontacion(foco, ctxFoco, baseDeps(provider));
    expect(out.response.reply).toContain("es tu gusto");
    expect(out.tokensIn).toBe(0);
  });
});
