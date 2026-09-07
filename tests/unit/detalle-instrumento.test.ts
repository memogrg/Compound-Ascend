/**
 * El detalle del instrumento: lo que la persona firmó, leído meses después.
 *
 * Lo que estos tests protegen es que el detalle no diga de más (una fila que
 * parece un término y no lo es) ni de menos (un cupón configurado que no
 * aparece). El número del cupón tiene que salir de la MISMA base que la
 * proyección de ingreso pasivo; si divergen, el detalle promete una cosa y el
 * flujo del mes muestra otra.
 */
import { describe, it, expect } from "vitest";
import {
  filasDeNota,
  terminosDeNota,
  payoutConfigurado,
  basePayout,
  esNota,
} from "@/modules/wealth/engine/detalle-instrumento";

const NOTA = {
  assetType: "nota_estructurada" as const,
  quantity: 1,
  averageCost: 10000,
  noteIssuer: "JP Morgan",
  noteUnderlying: "S&P 500",
  noteCapitalProtectionPct: 100,
  noteBarrierPct: 70,
  noteAutocall: true,
  noteAutocallDate: "2027-06-30",
  noteParticipationPct: 150,
  noteIsin: "XS1234567890",
  maturityDate: "2029-06-30",
};

describe("filas de términos", () => {
  it("lista lo cargado, con el emisor primero", () => {
    const filas = filasDeNota(NOTA);
    expect(filas[0]?.etiqueta).toBe("Emisor");
    expect(filas[0]?.valor).toBe("JP Morgan");
    expect(filas.map((f) => f.etiqueta)).toEqual([
      "Emisor",
      "Subyacente",
      "Protección de capital",
      "Barrera",
      "Participación",
      "Autocall",
      "Vencimiento",
      "ISIN",
    ]);
  });

  it("el emisor lleva la advertencia de que la protección depende de él", () => {
    const emisor = filasDeNota(NOTA)[0]!;
    expect(emisor.ayuda).toContain("vale lo que vale quien la promete");
  });

  it("un término no cargado NO produce fila vacía", () => {
    // Un "—" se leería como que el término existe y vale cero.
    const filas = filasDeNota({ assetType: "nota_estructurada", noteIssuer: "Banco X" });
    expect(filas).toHaveLength(1);
    expect(filas.some((f) => f.valor === "" || f.valor === "—")).toBe(false);
  });

  it("protección 0% sí produce fila: cero es un término, no un vacío", () => {
    const filas = filasDeNota({ noteCapitalProtectionPct: 0 });
    expect(filas).toEqual([{ etiqueta: "Protección de capital", valor: "0%" }]);
  });

  it("autocall sin fecha no inventa una", () => {
    const filas = filasDeNota({ noteAutocall: true });
    expect(filas[0]?.valor).toBe("Sí");
  });

  it("las fechas se muestran en dd/mm/aaaa", () => {
    const filas = filasDeNota({ maturityDate: "2029-06-30" });
    expect(filas[0]?.valor).toBe("30/06/2029");
  });
});

describe("adaptador a la lectura de riesgo", () => {
  it("mapea los términos del holding sin perder ninguno", () => {
    expect(terminosDeNota(NOTA)).toEqual({
      emisor: "JP Morgan",
      subyacente: "S&P 500",
      proteccionPct: 100,
      barreraPct: 70,
      autocall: true,
      autocallDate: "2027-06-30",
      participacionPct: 150,
      vencimiento: "2029-06-30",
    });
  });
});

describe("base del rendimiento", () => {
  it("el valor manual manda sobre lo invertido", () => {
    expect(basePayout({ quantity: 1, averageCost: 10000, currentValueManual: 9200 })).toBe(9200);
  });

  it("sin valor manual usa cantidad × costo promedio", () => {
    expect(basePayout({ quantity: 2, averageCost: 5000 })).toBe(10000);
  });

  it("un valor manual en 0 no gana: cae a lo invertido", () => {
    // 0 es "no lo cargué", no "vale cero". Misma regla que dividend-service.
    expect(basePayout({ quantity: 1, averageCost: 10000, currentValueManual: 0 })).toBe(10000);
  });
});

describe("cupón configurado", () => {
  const conCupon = {
    ...NOTA,
    payoutEnabled: true,
    payoutMode: "yield" as const,
    payoutRatePct: 8,
    payoutFrequency: "trimestral",
    payoutWithholdingPct: 10,
    payoutNextDate: "2026-09-30",
  };

  it("lo llama cupón, no dividendo, porque es una nota", () => {
    const p = payoutConfigurado(conCupon, "2026-09-07")!;
    expect(p.singular).toBe("cupón");
    expect(p.plural).toBe("cupones");
  });

  it("calcula el neto por pago descontando la retención", () => {
    // 10.000 × 8% = 800 al año → 200 por trimestre, menos 10% = 180.
    const p = payoutConfigurado(conCupon, "2026-09-07")!;
    expect(p.rendimiento.brutoPorPago).toBe(200);
    expect(p.rendimiento.netoPorPago).toBe(180);
    expect(p.retencionPct).toBe(10);
  });

  it("sin configuración devuelve null en vez de una tarjeta en cero", () => {
    // Una tarjeta en cero se leería como "no paga"; no es lo mismo que "no lo configuré".
    expect(payoutConfigurado({ ...NOTA, payoutEnabled: false }, "2026-09-07")).toBeNull();
  });

  it("habilitado pero sin frecuencia válida tampoco inventa nada", () => {
    expect(
      payoutConfigurado({ ...conCupon, payoutFrequency: "bimestral" }, "2026-09-07"),
    ).toBeNull();
  });

  it("un dividendo de acción se llama dividendo", () => {
    const p = payoutConfigurado(
      { ...conCupon, assetType: "accion", noteIssuer: null },
      "2026-09-07",
    )!;
    expect(p.singular).toBe("dividendo");
  });

  it("'bimensual' no se muestra crudo", () => {
    const p = payoutConfigurado({ ...conCupon, payoutFrequency: "bimensual" }, "2026-09-07")!;
    expect(p.frecuencia).toBe("cada 2 meses");
  });

  it("proyecta el próximo cobro hacia adelante si el ancla ya pasó", () => {
    const p = payoutConfigurado({ ...conCupon, payoutNextDate: "2026-03-31" }, "2026-09-07")!;
    expect(p.proximoCobro).not.toBeNull();
    expect(p.proximoCobro! >= "2026-09-07").toBe(true);
  });
});

describe("esNota", () => {
  it("distingue la nota de cualquier otro activo", () => {
    expect(esNota({ assetType: "nota_estructurada" })).toBe(true);
    expect(esNota({ assetType: "accion" })).toBe(false);
    expect(esNota({})).toBe(false);
  });
});
