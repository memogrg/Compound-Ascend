import { describe, it, expect } from "vitest";
import { buscarCandidato, parecenElMismo, ventanaDeFechas } from "@/lib/ingestion/reconcile";

const recibo = {
  id: "t1",
  kind: "gasto" as const,
  amount: 5150,
  currency: "CRC",
  occurredOn: "2026-09-04",
  merchant: "Subway",
};
const aviso = {
  id: "p1",
  kind: "gasto" as const,
  amount: 5150,
  currency: "CRC",
  occurredOn: "2026-09-04",
  merchant: "SUBWAY LAGUNILLA",
};

describe("conciliador · parecenElMismo", () => {
  it("recibo escaneado y aviso del banco: mismo monto, fecha y comercio parecido", () => {
    expect(parecenElMismo(aviso, recibo)).toBe(true);
  });
  it("el banco fecha un día después (liquidación / medianoche): sigue siendo el mismo", () => {
    expect(parecenElMismo({ ...aviso, occurredOn: "2026-09-05" }, recibo)).toBe(true);
    expect(parecenElMismo({ ...aviso, occurredOn: "2026-09-06" }, recibo)).toBe(false);
  });
  it("un céntimo de diferencia es otro movimiento", () => {
    expect(parecenElMismo({ ...aviso, amount: 5150.01 }, recibo)).toBe(false);
  });
  it("moneda o tipo distintos nunca casan", () => {
    expect(parecenElMismo({ ...aviso, currency: "USD" }, recibo)).toBe(false);
    expect(parecenElMismo({ ...aviso, kind: "ingreso" }, recibo)).toBe(false);
  });
  it("comercios distintos con el mismo monto son dos gastos (dos cafés iguales)", () => {
    expect(parecenElMismo({ ...aviso, merchant: "PANADERIA BARRIO LUJAN" }, recibo)).toBe(false);
  });
  it("si a uno le falta el comercio, mandan monto, moneda y fecha", () => {
    expect(parecenElMismo({ ...aviso, merchant: null }, recibo)).toBe(true);
    expect(parecenElMismo(aviso, { ...recibo, merchant: "" })).toBe(true);
  });
});

describe("conciliador · buscarCandidato", () => {
  it("prefiere la misma fecha y el comercio parecido; ignora a sí mismo", () => {
    const otro = { ...recibo, id: "t2", occurredOn: "2026-09-05", merchant: null };
    expect(buscarCandidato(aviso, [otro, recibo])?.id).toBe("t1");
    expect(buscarCandidato(aviso, [{ ...aviso }])).toBeNull();
  });
  it("sin candidatos → null", () => {
    expect(buscarCandidato(aviso, [{ ...recibo, amount: 1 }])).toBeNull();
  });
});

describe("conciliador · ventanaDeFechas", () => {
  it("cubre ±1 día alrededor del rango", () => {
    expect(ventanaDeFechas([{ occurredOn: "2026-09-04" }, { occurredOn: "2026-09-02" }])).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-05",
    });
    expect(ventanaDeFechas([])).toBeNull();
  });
});
