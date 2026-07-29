import { describe, it, expect } from "vitest";
import { applyGuardrail, NOTE_RETURNS, NOTE_RISK_BASE } from "@/lib/ai/guardrail";

describe("applyGuardrail · R1 rendimientos garantizados", () => {
  it("'te garantizo un 12% sin riesgo' → nota + flag promised_returns", () => {
    const r = applyGuardrail("Te garantizo un 12% sin riesgo si invertís acá.");
    expect(r.flags).toContain("promised_returns");
    expect(r.reply).toContain("CARTERA+: ninguna inversión garantiza rendimientos");
    // No mutila el contenido original.
    expect(r.reply).toContain("Te garantizo un 12%");
  });
});

describe("applyGuardrail · R2 fiscal/legal directivo", () => {
  it("consejo directivo sobre impuestos → disclaimer + flag fiscal_legal", () => {
    const r = applyGuardrail("Deberías deducir esos gastos para pagar menos impuestos este año.");
    expect(r.flags).toContain("fiscal_legal");
    expect(r.reply).toContain("CARTERA+: es orientación general; para tu caso fiscal/legal");
  });

  it("mención fiscal SIN tono directivo → no dispara (sin falso positivo)", () => {
    const r = applyGuardrail("Los impuestos varían según el país y tu situación.");
    expect(r.flags).not.toContain("fiscal_legal");
  });
});

describe("applyGuardrail · R3 riesgo sin base", () => {
  it("recomienda invertir + sin fondo de emergencia → caution + flag", () => {
    const r = applyGuardrail("Te recomiendo invertir en un ETF para que crezca tu dinero.", {
      hasEmergencyFund: "no",
    });
    expect(r.flags).toContain("risk_without_base");
    expect(r.reply).toContain("CARTERA+: conviene asegurar tu fondo de emergencia antes de invertir");
  });

  it("misma recomendación pero CON fondo y urgencia baja → no dispara", () => {
    const r = applyGuardrail("Te recomiendo invertir en un ETF para que crezca tu dinero.", {
      hasEmergencyFund: "si",
      urgency: "baja",
    });
    expect(r.flags).not.toContain("risk_without_base");
  });

  it("urgencia crítica también dispara R3", () => {
    const r = applyGuardrail("Conviene invertir parte en acciones.", { urgency: "critica" });
    expect(r.flags).toContain("risk_without_base");
  });

  const INVERTIR = "Te recomiendo invertir en un ETF para que crezca tu dinero.";

  it("respaldo REAL ≥3 meses pisa al auto-reporte 'no' → NO dispara (fix del falso positivo)", () => {
    const r = applyGuardrail(INVERTIR, { hasEmergencyFund: "no", emergencyMonths: 62 });
    expect(r.flags).not.toContain("risk_without_base");
    expect(r.reply).not.toContain("CARTERA+: conviene asegurar tu fondo de emergencia");
  });

  it("respaldo REAL <3 meses + 'no' → SÍ dispara", () => {
    const r = applyGuardrail(INVERTIR, { hasEmergencyFund: "no", emergencyMonths: 2 });
    expect(r.flags).toContain("risk_without_base");
  });

  it("emergencyMonths undefined → comportamiento viejo (con 'no' sigue disparando)", () => {
    const r = applyGuardrail(INVERTIR, { hasEmergencyFund: "no" });
    expect(r.flags).toContain("risk_without_base");
  });

  it("respaldo REAL ≥3 también prevalece sobre urgencia (corta todo el sinBase)", () => {
    const r = applyGuardrail(INVERTIR, { urgency: "critica", emergencyMonths: 62 });
    expect(r.flags).not.toContain("risk_without_base");
  });
});

describe("applyGuardrail · sin falsos positivos e idempotencia", () => {
  it("respuesta limpia normal → sin cambios ni flags", () => {
    const clean = "Tu flujo libre mensual quedó positivo; seguí registrando tus gastos del mes.";
    const r = applyGuardrail(clean);
    expect(r.flags).toEqual([]);
    expect(r.reply).toBe(clean);
  });

  it("aplicar dos veces no duplica las notas", () => {
    const once = applyGuardrail("Te garantizo ganancias seguras.");
    const twice = applyGuardrail(once.reply);
    const count = (twice.reply.match(/ninguna inversión garantiza rendimientos/g) ?? []).length;
    expect(count).toBe(1);
  });
});

describe("applyGuardrail · el disclaimer va UNA vez por conversación (no en cada turno)", () => {
  const REPLY = "Te garantizo un 12% sin riesgo.";

  it("si la nota YA se dijo en un turno previo → NO se re-anexa (pero la flag sí marca)", () => {
    const priorReply = `Cualquier cosa.\n\n${NOTE_RETURNS}`; // el asistente ya la dijo antes
    const r = applyGuardrail(REPLY, {}, [priorReply]);
    expect(r.flags).toContain("promised_returns"); // la regla aplicó (observabilidad)
    expect(r.reply).not.toContain(NOTE_RETURNS); // pero NO repite el disclaimer
    expect(r.reply).toBe(REPLY);
  });

  it("primer turno (sin previos) → sí anexa la nota", () => {
    const r = applyGuardrail(REPLY, {}, []);
    expect(r.reply).toContain(NOTE_RETURNS);
  });

  it("nota del fondo de emergencia tampoco se repite si ya se dio antes", () => {
    const invertir = "Te recomiendo invertir en un ETF para que crezca tu dinero.";
    const prior = `Antes dije: ${NOTE_RISK_BASE}`;
    const r = applyGuardrail(invertir, { hasEmergencyFund: "no" }, [prior]);
    expect(r.flags).toContain("risk_without_base");
    expect(r.reply).not.toContain(NOTE_RISK_BASE);
  });
});
