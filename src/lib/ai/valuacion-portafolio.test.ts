import { describe, it, expect } from "vitest";
import {
  etiquetaContexto,
  frasesValuacion,
  mesesDesde,
  MESES_MANUAL_VIEJO,
  resumirValuacion,
  type PosicionValuada,
} from "@/lib/ai/valuacion-portafolio";
import type { Monto } from "@/lib/ai/money";

/** Formateador trivial: los tests afirman NÚMEROS, no el formato de la moneda. */
const fmt = (m: Monto) => `${Math.round(m.monto)} ${m.moneda}`;

const pos = (p: Partial<PosicionValuada> & { name: string; fuente: PosicionValuada["fuente"] }) => {
  const invested = p.invested ?? 100;
  const value = p.value ?? invested;
  return {
    invested,
    value,
    pl: value - invested,
    monedaFila: "USD",
    invertidoPrimario: p.invertidoPrimario ?? invested,
    valorPrimario: p.valorPrimario ?? value,
    ...p,
  } as PosicionValuada;
};

/**
 * La cartera que motivó todo esto, con los números reales de la cuenta: la cripto en −44%, los ETF
 * en +29% y casi la mitad valuada a mano. Los dos promedios que había que dejar de dar son el que
 * funde mercado con manual (+$1.013 sobre una cartera en baja) y el que funde cripto con ETF
 * (−4,1%, que no describe a ninguno de los dos).
 */
const CRIPTO_INV = 127_091;
const CRIPTO_VAL = 71_183; // −44%
const ETF_INV = 210_222; // BTC spot + IBIT
const ETF_VAL = 252_442; // +20%

const CARTERA_REAL: PosicionValuada[] = [
  pos({ name: "cripto", fuente: "cripto", invested: CRIPTO_INV, value: CRIPTO_VAL }),
  pos({ name: "IBIT", fuente: "mercado", invested: ETF_INV, value: ETF_VAL }),
  pos({ name: "S&P 500 PLAN", fuente: "manual", invested: 66_000, value: 91_981 }),
  pos({ name: "CTA FUTURA C", fuente: "manual", invested: 60_585, value: 46_021 }),
  pos({ name: "certificados", fuente: "manual", invested: 189_762, value: 189_762 }),
];

describe("resumirValuacion · el reparto por fuente", () => {
  it("separa cripto, mercado tradicional, manual y sin precio, y cuenta cada grupo", () => {
    const v = resumirValuacion([
      pos({ name: "a", fuente: "cripto" }),
      pos({ name: "b", fuente: "mercado" }),
      pos({ name: "c", fuente: "mercado" }),
      pos({ name: "d", fuente: "manual" }),
      pos({ name: "e", fuente: "sin_precio" }),
    ]);
    expect(v.cripto.posiciones).toBe(1);
    expect(v.mercado.posiciones).toBe(2);
    expect(v.manual.posiciones).toBe(1);
    expect(v.sinPrecio.posiciones).toBe(1);
    expect(v.mezcla).toBe(true);
  });

  it("cripto y ETF salen como cortes SEPARADOS, cada uno con su propio rendimiento", () => {
    const v = resumirValuacion(CARTERA_REAL);
    // La cripto, muy abajo.
    expect(v.cripto.plPrimario).toBe(CRIPTO_VAL - CRIPTO_INV);
    expect(v.cripto.pctPrimario).toBeCloseTo(-0.44, 2);
    // Los ETF, arriba. Ninguno de los dos contamina al otro.
    expect(v.mercado.plPrimario).toBe(ETF_VAL - ETF_INV);
    expect(v.mercado.pctPrimario).toBeGreaterThan(0.15);
    // Y el promedio ponderado que ya NO se publica no coincide con ninguno de los dos.
    const promedio = (CRIPTO_VAL + ETF_VAL - CRIPTO_INV - ETF_INV) / (CRIPTO_INV + ETF_INV);
    expect(promedio).toBeGreaterThan(v.cripto.pctPrimario!);
    expect(promedio).toBeLessThan(v.mercado.pctPrimario!);
  });

  it("ningún grupo incluye lo valuado a mano", () => {
    const v = resumirValuacion(CARTERA_REAL);
    expect(v.manual.plPrimario).toBe(91_981 + 46_021 + 189_762 - (66_000 + 60_585 + 189_762));
    expect(v.cripto.plPrimario).not.toBe(v.manual.plPrimario);
    expect(v.mercado.plPrimario).not.toBe(v.manual.plPrimario);
  });

  it("el bug original: fundir los grupos tapa la caída de la cripto", () => {
    const v = resumirValuacion(CARTERA_REAL);
    const fundido =
      (v.cripto.plPrimario ?? 0) + (v.mercado.plPrimario ?? 0) + (v.manual.plPrimario ?? 0);
    // La cripto pierde 55.908 y el titular fundido queda en −2.271: el 96% de la caída
    // desaparece detrás de los ETF y de las marcas manuales. Con la cripto un poco más arriba
    // —como el 1/9 a las 16:32— ese mismo titular cruzaba a POSITIVO.
    expect(v.cripto.plPrimario).toBe(-55_908);
    expect(Math.abs(fundido)).toBeLessThan(Math.abs(v.cripto.plPrimario!) / 20);
  });

  it("sin_precio NUNCA publica resultado: es null, no 0", () => {
    const v = resumirValuacion([pos({ name: "x", fuente: "sin_precio", invested: 500 })]);
    expect(v.sinPrecio.pl).toBeNull();
    expect(v.sinPrecio.plPrimario).toBeNull();
    expect(v.sinPrecio.pctPrimario).toBeNull();
    // Lo invertido sí se puede reportar: es un dato del usuario, no del feed.
    expect(v.sinPrecio.invertido).toEqual([{ monto: 500, moneda: "USD" }]);
  });

  it("los subtotales no funden monedas distintas", () => {
    const v = resumirValuacion([
      pos({ name: "usd", fuente: "manual", invested: 100, monedaFila: "USD" }),
      pos({ name: "crc", fuente: "manual", invested: 50_000, monedaFila: "CRC" }),
    ]);
    expect(v.manual.invertido).toHaveLength(2);
    expect(v.manual.invertido.map((m) => m.moneda).sort()).toEqual(["CRC", "USD"]);
  });

  it("sin posiciones no inventa grupos", () => {
    const v = resumirValuacion([]);
    expect(v.mercado.posiciones).toBe(0);
    expect(v.haySinPrecio).toBe(false);
    expect(v.mayoriaSinPrecio).toBe(false);
    expect(v.mezcla).toBe(false);
  });
});

describe("mayoriaSinPrecio", () => {
  it("se dispara cuando MÁS de la mitad de lo invertido no se puede valuar", () => {
    const v = resumirValuacion([
      pos({ name: "sin", fuente: "sin_precio", invested: 600 }),
      pos({ name: "con", fuente: "mercado", invested: 400 }),
    ]);
    expect(v.mayoriaSinPrecio).toBe(true);
  });

  it("exactamente la mitad NO alcanza (el umbral es estricto)", () => {
    const v = resumirValuacion([
      pos({ name: "sin", fuente: "sin_precio", invested: 500 }),
      pos({ name: "con", fuente: "mercado", invested: 500 }),
    ]);
    expect(v.mayoriaSinPrecio).toBe(false);
  });

  it("mide sobre lo INVERTIDO, no sobre el valor (que para esas no existe)", () => {
    const v = resumirValuacion([
      pos({ name: "sin", fuente: "sin_precio", invested: 600, value: 600 }),
      // Una que subió mucho no debería tapar que la mayoría del capital está a ciegas.
      pos({ name: "con", fuente: "mercado", invested: 400, value: 5_000 }),
    ]);
    expect(v.mayoriaSinPrecio).toBe(true);
  });
});

describe("manualesSinActualizar", () => {
  it("marca las manuales con valor = costo y mucho tiempo sin tocarse", () => {
    const v = resumirValuacion([
      pos({
        name: "ANGIE 7.5M",
        fuente: "manual",
        invested: 7_500_000,
        value: 7_500_000,
        valorIgualCosto: true,
        mesesSinTocar: 14,
      }),
    ]);
    expect(v.manualesSinActualizar).toEqual([{ name: "ANGIE 7.5M", meses: 14 }]);
  });

  it("una manual que SÍ se valuó (valor ≠ costo) no se marca aunque sea vieja", () => {
    const v = resumirValuacion([
      pos({
        name: "S&P 500 PLAN",
        fuente: "manual",
        invested: 66_000,
        value: 91_981,
        valorIgualCosto: false,
        mesesSinTocar: 20,
      }),
    ]);
    expect(v.manualesSinActualizar).toEqual([]);
  });

  it("una manual recién tocada no se marca aunque el valor sea el costo", () => {
    const v = resumirValuacion([
      pos({
        name: "CDP",
        fuente: "manual",
        valorIgualCosto: true,
        mesesSinTocar: MESES_MANUAL_VIEJO - 1,
      }),
    ]);
    expect(v.manualesSinActualizar).toEqual([]);
  });

  it("sin fecha conocida no se marca: no se acusa sin saber", () => {
    const v = resumirValuacion([
      pos({ name: "X", fuente: "manual", valorIgualCosto: true, mesesSinTocar: null }),
    ]);
    expect(v.manualesSinActualizar).toEqual([]);
  });
});

describe("mesesDesde", () => {
  const ahora = Date.parse("2026-09-01T00:00:00Z");
  it("cuenta meses enteros hacia atrás", () => {
    expect(mesesDesde("2026-03-01T00:00:00Z", ahora)).toBe(6);
    expect(mesesDesde("2025-09-01T00:00:00Z", ahora)).toBe(12);
  });
  it("null ante fecha ausente, inválida o futura", () => {
    expect(mesesDesde(null, ahora)).toBeNull();
    expect(mesesDesde("no es fecha", ahora)).toBeNull();
    expect(mesesDesde("2027-01-01T00:00:00Z", ahora)).toBeNull();
  });
});

describe("frasesValuacion · lo que se le dice al usuario", () => {
  const texto = (p: PosicionValuada[], voz?: "vos" | "tu") =>
    frasesValuacion(resumirValuacion(p), { fmt, voz }).join(" · ");

  it("con la cartera real: tres cortes, cada uno con su propio resultado", () => {
    const t = texto(CARTERA_REAL);
    expect(t).toContain("−55908 USD"); // la cripto, sola
    expect(t).toContain("+42220 USD"); // los ETF, solos
    expect(t).toContain("valuadas por vos, no por el mercado");
    // Ni el fundido total (−2.271) ni el promedio de lo cotizado (−13.688) se publican.
    expect(t).not.toContain("−2271");
    expect(t).not.toContain("−13688");
  });

  it("cripto, mercado y manual NUNCA quedan en la misma frase", () => {
    const fs = frasesValuacion(resumirValuacion(CARTERA_REAL), { fmt });
    const conCripto = fs.filter((f) => f.startsWith("Tu cripto"));
    const conMercado = fs.filter((f) => f.startsWith("Tus acciones y ETF"));
    const conManual = fs.filter((f) => f.includes("por el mercado"));
    expect(conCripto).toHaveLength(1);
    expect(conMercado).toHaveLength(1);
    expect(conManual).toHaveLength(1);
    expect(new Set([conCripto[0], conMercado[0], conManual[0]]).size).toBe(3);
  });

  it("con posiciones sin precio: lo dice SIEMPRE y aclara qué muestra por ellas", () => {
    const t = texto([
      pos({ name: "a", fuente: "mercado", invested: 900, value: 1_000 }),
      pos({ name: "b", fuente: "sin_precio", invested: 100 }),
    ]);
    expect(t).toContain("no tiene precio ahora mismo");
    expect(t).toContain("muestro lo invertido");
  });

  it("las sin precio no entran en el resultado afirmado", () => {
    const soloMercado = resumirValuacion([
      pos({ name: "a", fuente: "mercado", invested: 900, value: 1_000 }),
    ]);
    const conSinPrecio = resumirValuacion([
      pos({ name: "a", fuente: "mercado", invested: 900, value: 1_000 }),
      pos({ name: "b", fuente: "sin_precio", invested: 5_000 }),
    ]);
    expect(conSinPrecio.mercado.plPrimario).toBe(soloMercado.mercado.plPrimario);
    expect(conSinPrecio.mercado.pctPrimario).toBe(soloMercado.mercado.pctPrimario);
  });

  it("mayoría sin precio: cambia el tono y NO da un valor de portafolio", () => {
    const fs = frasesValuacion(
      resumirValuacion([
        pos({ name: "a", fuente: "sin_precio", invested: 8_000 }),
        pos({ name: "b", fuente: "mercado", invested: 1_000, value: 1_200 }),
      ]),
      { fmt },
    );
    const t = fs.join(" · ");
    expect(t).toContain("No puedo valuar tu portafolio ahora mismo");
    expect(t).toContain("Lo que invertiste es");
    // Nada de "vale X" ni de resultados.
    expect(t).not.toContain("cotizadas valen");
    expect(t).not.toContain("+200");
  });

  it("la pregunta por las manuales dormidas es una pregunta, no un reproche", () => {
    const t = texto([
      pos({ name: "a", fuente: "mercado", invested: 100, value: 110 }),
      pos({
        name: "ANGIE 7.5M",
        fuente: "manual",
        invested: 7_500_000,
        value: 7_500_000,
        valorIgualCosto: true,
        mesesSinTocar: 14,
      }),
    ]);
    expect(t).toContain("¿siguen valiendo eso?");
    expect(t).toContain("hace 1 año");
    expect(t).not.toMatch(/deber[íi]as|ten[ée]s que|error/i);
  });

  it("sin manuales dormidas no se agrega la pregunta", () => {
    const t = texto([pos({ name: "a", fuente: "mercado", invested: 100, value: 110 })]);
    expect(t).not.toContain("¿siguen valiendo eso?");
  });

  it("la voz sigue a la superficie: voseo en web, tú en móvil", () => {
    const conManual: PosicionValuada[] = [
      pos({ name: "a", fuente: "mercado", invested: 100, value: 110 }),
      pos({
        name: "b",
        fuente: "manual",
        invested: 50,
        value: 50,
        valorIgualCosto: true,
        mesesSinTocar: 12,
      }),
    ];
    expect(texto(conManual, "vos")).toContain("actualizás");
    expect(texto(conManual, "vos")).toContain("por vos");
    const tu = texto(conManual, "tu");
    expect(tu).toContain("actualizas");
    expect(tu).toContain("por tú");
    expect(tu).not.toContain("actualizás");
  });

  it("una cartera de un solo corte se lee en una sola frase, sin ruido extra", () => {
    const fs = frasesValuacion(
      resumirValuacion([pos({ name: "a", fuente: "mercado", invested: 900, value: 1_000 })]),
      { fmt },
    );
    expect(fs).toHaveLength(1);
    expect(fs[0]).toContain("Tus acciones y ETF");
    // Sin cripto no se menciona un corte vacío.
    expect(fs[0]).not.toContain("cripto");
  });
});

describe("etiquetaContexto · lo que ve el modelo", () => {
  it("avisa de la mezcla para que el LLM no la presente como resultado de mercado", () => {
    const e = etiquetaContexto(resumirValuacion(CARTERA_REAL))!;
    expect(e).toContain("valuadas a mano");
    expect(e).toContain("NO presentes su suma como un resultado de mercado");
  });

  it("avisa de los placeholders", () => {
    const e = etiquetaContexto(
      resumirValuacion([
        pos({ name: "a", fuente: "mercado", invested: 900, value: 1_000 }),
        pos({ name: "b", fuente: "sin_precio", invested: 100 }),
      ]),
    )!;
    expect(e).toContain("placeholder");
    expect(e).toContain("NO afirmes ganancia ni pérdida");
  });

  it("mayoría sin precio: le prohíbe dar un total", () => {
    const e = etiquetaContexto(
      resumirValuacion([
        pos({ name: "a", fuente: "sin_precio", invested: 8_000 }),
        pos({ name: "b", fuente: "mercado", invested: 1_000, value: 1_200 }),
      ]),
    )!;
    expect(e).toContain("no des un valor total");
  });

  it("una cartera limpia no arrastra etiqueta", () => {
    expect(etiquetaContexto(resumirValuacion([pos({ name: "a", fuente: "mercado" })]))).toBeNull();
  });
});
