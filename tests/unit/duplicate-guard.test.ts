/**
 * GUARDA ANTI-DUPLICADO del alta de movimientos.
 *
 * Las tres puertas (tarjeta del chat, recibo escaneado y lote del estado de cuenta) escribían sin
 * mirar lo que ya había. Duplicar un gasto no se nota: aparece dos veces en un listado largo, el
 * sobre queda corto y el usuario cree que gastó de más.
 *
 * La regla es AVISAR, no bloquear: un duplicado legítimo existe (dos cafés iguales el mismo día en
 * el mismo lugar), así que la salida es una confirmación explícita.
 */
import { describe, it, expect } from "vitest";
import {
  buscarDuplicado,
  comercioParecido,
  normalizarComercio,
  mensajeDuplicado,
} from "@/lib/ai/duplicate-guard";

const SOBRE = "11111111-1111-1111-1111-111111111111";
const OTRO_SOBRE = "22222222-2222-2222-2222-222222222222";

const existente = {
  id: "tx-1",
  kind: "gasto" as const,
  amount: 37747,
  currency: "USD",
  occurredOn: "2026-08-02",
  categoryId: SOBRE,
  description: "Transporte de vehículo",
};

const candidato = {
  kind: "gasto" as const,
  amount: 37747,
  currency: "USD",
  occurredOn: "2026-08-02",
  categoryId: SOBRE,
  description: "transporte de vehiculo",
};

describe("normalizarComercio / comercioParecido", () => {
  it("ignora tildes, mayúsculas y puntuación", () => {
    expect(normalizarComercio("SÚPER MERCADO S.A.")).toBe("super mercado s a");
    expect(comercioParecido("SÚPER MERCADO S.A.", "Super Mercado SA")).toBe(true);
  });

  it("el banco alarga los nombres: uno contenido en el otro es el mismo comercio", () => {
    expect(comercioParecido("SUBWAY", "SUBWAY LAGUNILLA")).toBe(true);
  });

  it("comercios distintos no se parecen", () => {
    expect(comercioParecido("Walmart", "Automercado")).toBe(false);
  });

  it("sin texto no se puede opinar", () => {
    expect(comercioParecido("", "Walmart")).toBe(false);
  });
});

describe("buscarDuplicado", () => {
  it("mismo monto + fecha + sobre + comercio parecido → duplicado", () => {
    expect(buscarDuplicado(candidato, [existente])?.id).toBe("tx-1");
  });

  it("distinto monto, fecha, moneda o tipo → NO es duplicado", () => {
    expect(buscarDuplicado({ ...candidato, amount: 37748 }, [existente])).toBeNull();
    expect(buscarDuplicado({ ...candidato, occurredOn: "2026-08-03" }, [existente])).toBeNull();
    expect(buscarDuplicado({ ...candidato, currency: "CRC" }, [existente])).toBeNull();
    expect(buscarDuplicado({ ...candidato, kind: "ingreso" }, [existente])).toBeNull();
  });

  it("mismo todo pero OTRO sobre → son dos gastos distintos", () => {
    expect(buscarDuplicado({ ...candidato, categoryId: OTRO_SOBRE }, [existente])).toBeNull();
  });

  it("el candidato sin sobre todavía (lo pone la auto-categorización): manda el comercio", () => {
    expect(buscarDuplicado({ ...candidato, categoryId: null }, [existente])?.id).toBe("tx-1");
    expect(
      buscarDuplicado({ ...candidato, categoryId: null, description: "Walmart" }, [existente]),
    ).toBeNull();
  });

  it("con el mismo sobre y un comercio ilegible alcanzan las otras señales", () => {
    expect(buscarDuplicado({ ...candidato, description: "" }, [existente])?.id).toBe("tx-1");
  });

  it("los céntimos se comparan redondeados", () => {
    expect(buscarDuplicado({ ...candidato, amount: 37747.001 }, [existente])?.id).toBe("tx-1");
  });

  it("sin nada del día no hay duplicado", () => {
    expect(buscarDuplicado(candidato, [])).toBeNull();
  });
});

describe("el aviso", () => {
  it("termina en pregunta: la decisión es del usuario", () => {
    expect(mensajeDuplicado("2 de agosto de 2026")).toBe(
      "Esto ya parece registrado el 2 de agosto de 2026 — ¿lo registro igual?",
    );
  });
});
