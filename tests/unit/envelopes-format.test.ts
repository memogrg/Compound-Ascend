import { describe, it, expect } from "vitest";
import { formatEnvelopesReply, type EnvelopesSummary } from "@/modules/financial-base/services/envelopes-service";

// formatEnvelopesReply es puro: agrupa por frasco y separa gasto vs acumulables. Determinista,
// sin cifras inventadas (base de la Mejora 3). server-only se stubea vía vitest.config.

describe("formatEnvelopesReply · agrupado por frasco", () => {
  const summary: EnvelopesSummary = {
    currency: "USD",
    expense: [
      { frasco: "Transporte", envelopes: [{ name: "Gastos de vehículo", budget: 200 }] },
      {
        frasco: "Vivienda",
        envelopes: [
          { name: "Supermercados", budget: 400 },
          { name: "Restaurantes", budget: 150 },
          { name: "Limpieza", budget: 0 },
        ],
      },
    ],
    goals: [{ frasco: "Estilo de Vida", names: ["Claude MAX"] }],
  };

  it("separa sobres de gasto y acumulables, cada uno agrupado por frasco", () => {
    const out = formatEnvelopesReply(summary);
    expect(out).toContain("Tus sobres de gasto mensual:");
    expect(out).toContain("Frasco Transporte:");
    expect(out).toContain("Gastos de vehículo");
    expect(out).toContain("Frasco Vivienda:");
    expect(out).toContain("Supermercados, Restaurantes, Limpieza");
    expect(out).toContain("Tus sobres acumulables (metas):");
    expect(out).toContain("Frasco Estilo de Vida:");
    expect(out).toContain("Claude MAX");
  });

  it("caso vacío → mensaje claro, sin inventar", () => {
    const out = formatEnvelopesReply({ currency: "USD", expense: [], goals: [] });
    expect(out).toContain("Todavía no tenés");
  });
});
