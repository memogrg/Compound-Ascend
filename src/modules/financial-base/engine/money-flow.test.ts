import { describe, it, expect } from "vitest";
import {
  describeMoneyFlow,
  LIQUIDITY_LABEL,
  type MoneyFlowInput,
} from "@/modules/financial-base/engine/money-flow";

/** Construye la entrada mínima; por defecto un gasto suelto. */
function txn(over: Partial<MoneyFlowInput>): MoneyFlowInput {
  return {
    kind: "gasto",
    linkedKind: "none",
    merchantOrSource: null,
    accountLabel: null,
    countsInBudget: true,
    ...over,
  };
}

describe("describeMoneyFlow · tabla de verdad del viaje", () => {
  it("Ingreso normal → in, [fuente] → tu liquidez, recibido_en", () => {
    const f = describeMoneyFlow(txn({ kind: "ingreso", merchantOrSource: "Nómina" }));
    expect(f).toMatchObject({
      effect: "in",
      fromLabel: "Nómina",
      toLabel: LIQUIDITY_LABEL,
      verb: "recibido_en",
      isJarSpend: false,
    });
  });

  it("Dividendo (ingreso/holding) → in, [activo] → tu liquidez", () => {
    const f = describeMoneyFlow(txn({ kind: "ingreso", linkedKind: "holding", merchantOrSource: "AAPL" }));
    expect(f).toMatchObject({ effect: "in", fromLabel: "AAPL", toLabel: LIQUIDITY_LABEL, verb: "recibido_en" });
  });

  it("Renta (ingreso/rental) → in", () => {
    const f = describeMoneyFlow(txn({ kind: "ingreso", linkedKind: "rental", merchantOrSource: "Depto Centro" }));
    expect(f).toMatchObject({ effect: "in", fromLabel: "Depto Centro", toLabel: LIQUIDITY_LABEL });
  });

  it("Retiro de meta (ingreso/goal) → in, Meta → tu liquidez", () => {
    const f = describeMoneyFlow(txn({ kind: "ingreso", linkedKind: "goal", merchantOrSource: "Viaje Japón" }));
    expect(f).toMatchObject({ effect: "in", fromLabel: "Viaje Japón", toLabel: LIQUIDITY_LABEL });
  });

  it("Venta de inversión (ingreso/holding) → in", () => {
    const f = describeMoneyFlow(txn({ kind: "ingreso", linkedKind: "holding", merchantOrSource: "BTC" }));
    expect(f).toMatchObject({ effect: "in", toLabel: LIQUIDITY_LABEL });
  });

  it("Gasto normal → out, tu liquidez → [comercio], pagado_a", () => {
    const f = describeMoneyFlow(txn({ kind: "gasto", merchantOrSource: "Oxxo" }));
    expect(f).toMatchObject({
      effect: "out",
      fromLabel: LIQUIDITY_LABEL,
      toLabel: "Oxxo",
      verb: "pagado_a",
      isJarSpend: false,
    });
  });

  it("Pago de deuda (gasto/debt) → out, tu liquidez → Deuda, abona_a", () => {
    const f = describeMoneyFlow(txn({ kind: "gasto", linkedKind: "debt", merchantOrSource: "Tarjeta BBVA" }));
    expect(f).toMatchObject({ effect: "out", fromLabel: LIQUIDITY_LABEL, toLabel: "Tarjeta BBVA", verb: "abona_a" });
  });

  it("Aporte a meta (gasto/goal, countsInBudget=true) → out, se_almacena_en", () => {
    const f = describeMoneyFlow(txn({ kind: "gasto", linkedKind: "goal", merchantOrSource: "Fondo emergencia" }));
    expect(f).toMatchObject({ effect: "out", toLabel: "Fondo emergencia", verb: "se_almacena_en" });
  });

  it("Compra de inversión (gasto/holding) → out, se_almacena_en", () => {
    const f = describeMoneyFlow(txn({ kind: "gasto", linkedKind: "holding", merchantOrSource: "VOO" }));
    expect(f).toMatchObject({ effect: "out", toLabel: "VOO", verb: "se_almacena_en" });
  });

  it("Prima de seguro (gasto/policy) → out, abona_a", () => {
    const f = describeMoneyFlow(txn({ kind: "gasto", linkedKind: "policy", merchantOrSource: "GNP Vida" }));
    expect(f).toMatchObject({ effect: "out", toLabel: "GNP Vida", verb: "abona_a" });
  });

  it("Consumo de frasco (gasto/goal, countsInBudget=false) → neutral, sale del frasco", () => {
    const f = describeMoneyFlow(
      txn({ kind: "gasto", linkedKind: "goal", merchantOrSource: "Viaje Japón", countsInBudget: false }),
    );
    expect(f).toMatchObject({
      effect: "neutral",
      fromLabel: "Viaje Japón",
      toLabel: "",
      isJarSpend: true,
    });
    // No toca tu liquidez: "Tu liquidez" NO aparece como origen ni destino.
    expect(f.fromLabel).not.toBe(LIQUIDITY_LABEL);
    expect(f.toLabel).not.toBe(LIQUIDITY_LABEL);
  });

  it("Transferencia → neutral, A → B, movido_entre_cuentas", () => {
    const f = describeMoneyFlow(
      txn({ kind: "transferencia", merchantOrSource: "Nu → BBVA", accountLabel: "Nu" }),
    );
    expect(f).toMatchObject({
      effect: "neutral",
      fromLabel: "Nu",
      toLabel: "BBVA",
      verb: "movido_entre_cuentas",
      isJarSpend: false,
    });
  });

  it("Ajuste → neutral, sin viaje", () => {
    const f = describeMoneyFlow(txn({ kind: "ajuste", merchantOrSource: null }));
    expect(f).toMatchObject({ effect: "neutral", verb: "ajuste" });
  });

  it("linkedKind ausente (undefined) se trata como 'none'", () => {
    const f = describeMoneyFlow({
      kind: "gasto",
      linkedKind: undefined,
      merchantOrSource: "Café",
      accountLabel: null,
      countsInBudget: true,
    });
    expect(f).toMatchObject({ effect: "out", toLabel: "Café", verb: "pagado_a" });
  });

  it("sin merchantOrSource → fallback legible por tipo", () => {
    expect(describeMoneyFlow(txn({ kind: "ingreso", merchantOrSource: null })).fromLabel).toBe("Ingreso");
    expect(describeMoneyFlow(txn({ kind: "gasto", merchantOrSource: null })).toLabel).toBe("Gasto");
  });
});
