import { describe, it, expect } from "vitest";
import {
  surfaceNextProposal,
  confirmProposal,
  discardProposal,
  proposalToPendingAction,
  buildProposalPrompt,
  buildPendingNudge,
  type ReviewDeps,
  type ProposalView,
  type ProposalPending,
} from "@/lib/ingestion/review-flow";

const P1: ProposalView = {
  id: "p1",
  kind: "gasto",
  amount: 6900,
  currency: "CRC",
  occurredOn: "2026-06-27",
  merchant: "HELADOS MOYO",
  cardLabel: "Mastercard personal",
};
const P2: ProposalView = {
  id: "p2",
  kind: "gasto",
  amount: 1200,
  currency: "CRC",
  occurredOn: "2026-06-28",
  merchant: "UBER",
  cardLabel: null,
};

/** Deps fake: cola en memoria por estado, registra mensajes/transacciones. */
function makeHarness(proposals: ProposalView[], txOk = true) {
  const status = new Map(proposals.map((p) => [p.id, "pending"] as const));
  const sent: string[] = [];
  const buttons: string[] = [];
  const created: ProposalPending[] = [];
  let pending: ProposalPending | null = null;
  const deps: ReviewDeps = {
    getOldestPending: async () =>
      proposals.find((p) => status.get(p.id) === "pending") ?? null,
    setPending: async (a) => {
      pending = a as ProposalPending | null;
    },
    sendButtons: async (t) => {
      buttons.push(t);
    },
    sendText: async (t) => {
      sent.push(t);
    },
    createTransaction: async (a) => {
      if (txOk) created.push(a as ProposalPending);
      return { ok: txOk };
    },
    markConfirmed: async (id) => {
      status.set(id, "confirmed" as never);
    },
    markDiscarded: async (id) => {
      status.set(id, "discarded" as never);
    },
  };
  return { deps, sent, buttons, created, status, getPending: () => pending };
}

describe("review-flow · helpers puros", () => {
  it("proposalToPendingAction marca origin=imported/source=email + proposalId + cardLabel", () => {
    const a = proposalToPendingAction(P1);
    expect(a.proposalId).toBe("p1");
    expect(a.origin).toBe("imported");
    expect(a.source).toBe("email");
    expect(a.cardLabel).toBe("Mastercard personal");
    expect(a.description).toBe("HELADOS MOYO · Mastercard personal");
  });

  it("buildProposalPrompt arma el texto con monto, detalle y fecha", () => {
    const prompt = buildProposalPrompt(proposalToPendingAction(P1));
    expect(prompt).toContain("🏦 Gasto de");
    expect(prompt).toContain("HELADOS MOYO · Mastercard personal");
    expect(prompt).toContain("el 2026-06-27");
    expect(prompt.endsWith("¿Lo agrego?")).toBe(true);
  });

  it("buildPendingNudge: plural/singular y null sin pendientes", () => {
    expect(buildPendingNudge(2)).toContain("2 movimientos");
    expect(buildPendingNudge(1)).toContain("1 movimiento");
    expect(buildPendingNudge(0)).toBeNull();
  });
});

describe("review-flow · flujo reactivo", () => {
  it("revisar con 2 pendientes: ofrece la más antigua, confirma, encadena y termina", async () => {
    const h = makeHarness([P1, P2]);

    // revisar -> ofrece p1
    await surfaceNextProposal(h.deps);
    expect(h.buttons[0]).toContain("HELADOS MOYO");
    expect(h.getPending()?.proposalId).toBe("p1");

    // confirmar p1 -> crea transacción, marca confirmed, encadena p2
    await confirmProposal(h.deps, h.getPending()!);
    expect(h.created).toHaveLength(1);
    expect(h.status.get("p1")).toBe("confirmed");
    expect(h.sent.some((s) => s.startsWith("✅ Anotado"))).toBe(true);
    expect(h.buttons[1]).toContain("UBER");
    expect(h.getPending()?.proposalId).toBe("p2");

    // confirmar p2 -> no quedan
    await confirmProposal(h.deps, h.getPending()!);
    expect(h.status.get("p2")).toBe("confirmed");
    expect(h.sent.some((s) => s.includes("No tenés movimientos por confirmar"))).toBe(true);
    expect(h.getPending()).toBeNull();
  });

  it("editar marca discarded y pasa a la siguiente", async () => {
    const h = makeHarness([P1, P2]);
    await surfaceNextProposal(h.deps); // p1
    await discardProposal(h.deps, h.getPending()!);
    expect(h.status.get("p1")).toBe("discarded");
    expect(h.sent.some((s) => s.includes("Descarté"))).toBe(true);
    expect(h.getPending()?.proposalId).toBe("p2"); // encadenó la siguiente
  });

  it("sin pendientes: avisa que no hay y limpia el pending", async () => {
    const h = makeHarness([]);
    const surfaced = await surfaceNextProposal(h.deps);
    expect(surfaced).toBe(false);
    expect(h.sent).toEqual(["✅ No tenés movimientos por confirmar."]);
    expect(h.getPending()).toBeNull();
  });

  it("si la transacción falla: no marca confirmed ni encadena (deja reintentar)", async () => {
    const h = makeHarness([P1, P2], /* txOk */ false);
    await surfaceNextProposal(h.deps); // p1
    h.buttons.length = 0; // descartar el botón de la oferta inicial
    await confirmProposal(h.deps, h.getPending()!);
    expect(h.status.get("p1")).toBe("pending"); // sigue pendiente
    expect(h.sent.some((s) => s.includes("No pude guardarlo"))).toBe(true);
    expect(h.buttons).toHaveLength(0); // no encadenó la siguiente
  });
});
