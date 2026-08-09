/**
 * SOBRES OCIOSOS — motor puro (lib/rhythm/idle-envelopes.ts) y su detector.
 *
 * El riesgo de este detector no es que se calle: es que hable de más. Declarar ocioso un
 * sobre que estaba bien —el seguro que se paga en marzo, el mes que no hubo dentista— es un
 * reproche por algo correcto, y encima invita a desarmar un presupuesto sano. Casi todos los
 * tests de acá son de SILENCIO.
 */
import { describe, it, expect } from "vitest";

import {
  OCIOSO_MESES_VENTANA,
  OCIOSO_UMBRAL_SIN_USAR,
  detectarOciosos,
  textoOcioso,
  textoSalidaOcioso,
  type SobreHistorico,
} from "@/lib/rhythm/idle-envelopes";
import { detectSobreOcioso } from "@/lib/rhythm/detectors";
import { suggestedAction } from "@/lib/insights/actions";
import { INSIGHT_RELATED_KINDS } from "@/lib/insights/types";

const fmt = (n: number, c: string) => `${c}${Math.round(n)}`;

const sobre = (over: Partial<SobreHistorico> & { categoryId: string }): SobreHistorico => ({
  path: `Vivir › ${over.categoryId}`,
  frascoId: "vivir",
  budgetMensual: 100_000,
  gastoVentana: 0,
  ...over,
});

const base = (sobres: SobreHistorico[], meses = OCIOSO_MESES_VENTANA) => ({
  sobres,
  mesesVentana: meses,
  currency: "CRC",
});

describe("detectarOciosos · cuándo SÍ", () => {
  it("un sobre con presupuesto y casi sin uso en la ventana", () => {
    // ₡100.000/mes × 3 = ₡300.000 apartados; usó ₡20.000 → 93% sin usar.
    const out = detectarOciosos(base([sobre({ categoryId: "farmacia", gastoVentana: 20_000 })]));
    expect(out).toHaveLength(1);
    expect(out[0]?.categoryId).toBe("farmacia");
  });

  it("calcula el promedio mensual y lo ocioso por mes", () => {
    const out = detectarOciosos(base([sobre({ categoryId: "farmacia", gastoVentana: 30_000 })]));
    expect(out[0]?.gastoMensualPromedio).toBe(10_000);
    expect(out[0]?.ociosoMensual).toBe(90_000);
  });

  it("ordena por la plata que inmoviliza, no por el porcentaje", () => {
    // "chico" está 100% sin usar pero inmoviliza ₡20.000; "grande" inmoviliza ₡190.000.
    const out = detectarOciosos(
      base([
        sobre({ categoryId: "chico", budgetMensual: 20_000, gastoVentana: 0 }),
        sobre({ categoryId: "grande", budgetMensual: 200_000, gastoVentana: 30_000 }),
      ]),
    );
    expect(out[0]?.categoryId).toBe("grande");
  });
});

describe("detectarOciosos · cuándo NO (lo que evita el reproche)", () => {
  it("un sobre que usa lo suyo no es ocioso", () => {
    const out = detectarOciosos(base([sobre({ categoryId: "comida", gastoVentana: 280_000 })]));
    expect(out).toEqual([]);
  });

  it("justo en el umbral no dispara; un poco por encima sí", () => {
    const presupuestoVentana = 100_000 * OCIOSO_MESES_VENTANA;
    // Exactamente el umbral de "sin usar" → NO (el corte es estricto hacia arriba).
    const enElBorde = presupuestoVentana * (1 - OCIOSO_UMBRAL_SIN_USAR);
    expect(
      detectarOciosos(base([sobre({ categoryId: "x", gastoVentana: enElBorde + 1 })])),
    ).toEqual([]);
    expect(
      detectarOciosos(base([sobre({ categoryId: "x", gastoVentana: enElBorde - 1 })])),
    ).toHaveLength(1);
  });

  it("CALLA con menos de dos meses de historia: un mes flojo no es un patrón", () => {
    // El caso que arruinaría el primer mes de uso: sin este guardia, casi todos los sobres
    // de una cuenta nueva parecerían ociosos.
    expect(detectarOciosos(base([sobre({ categoryId: "x" })], 1))).toEqual([]);
    expect(detectarOciosos(base([sobre({ categoryId: "x" })], 0))).toEqual([]);
    expect(detectarOciosos(base([sobre({ categoryId: "x" })], 2))).toHaveLength(1);
  });

  it("ignora sobres sin presupuesto: no hay nada apartado que liberar", () => {
    expect(
      detectarOciosos(base([sobre({ categoryId: "x", budgetMensual: 0, gastoVentana: 0 })])),
    ).toEqual([]);
  });

  it("ignora sobres irrelevantes por PESO, no por monto fijo", () => {
    const out = detectarOciosos(
      base([
        sobre({ categoryId: "grande", budgetMensual: 1_000_000, gastoVentana: 900_000 }),
        sobre({ categoryId: "chico", budgetMensual: 10_000, gastoVentana: 0 }),
      ]),
    );
    expect(out.map((o) => o.categoryId)).not.toContain("chico");
  });
});

describe("salidas · adónde va esa plata", () => {
  /** Un ocioso + un sobre que se queda corto (receptor) + un hermano usado (fusión). */
  const escenario = () =>
    detectarOciosos(
      base([
        sobre({ categoryId: "farmacia", path: "Vivir › Farmacia", gastoVentana: 10_000 }),
        // Gastó ₡400.000 sobre ₡300.000 apartados: le faltan ~₡33.000/mes.
        sobre({
          categoryId: "comida",
          path: "Vivir › Comida",
          budgetMensual: 100_000,
          gastoVentana: 400_000,
        }),
      ]),
    );

  it("propone mover al sobre que se queda corto", () => {
    const mover = escenario()[0]?.salidas.find((s) => s.tipo === "mover");
    expect(mover).toBeDefined();
    expect(mover!.hastaCategoryId).toBe("comida");
  });

  it("el monto se topea por lo que al RECEPTOR le falta, no por lo ocioso", () => {
    // Ocioso: ~₡96.700/mes. Le falta a comida: ~₡33.300/mes. Mandarle los 96.700 sería
    // repetir el problema del otro lado.
    const mover = escenario()[0]?.salidas.find((s) => s.tipo === "mover");
    expect(mover!.monto).toBeLessThan(50_000);
    expect(mover!.monto).toBeGreaterThan(20_000);
  });

  it("un sobre que va bien NO es receptor: no tiene un problema que resolver", () => {
    const out = detectarOciosos(
      base([
        sobre({ categoryId: "farmacia", gastoVentana: 10_000 }),
        // Usa el 95% de lo suyo: bien calibrado.
        sobre({ categoryId: "comida", gastoVentana: 285_000 }),
      ]),
    );
    expect(out[0]?.salidas.some((s) => s.tipo === "mover")).toBe(false);
  });

  it("propone fusionar con un hermano del MISMO frasco que sí se usa", () => {
    const fus = escenario()[0]?.salidas.find((s) => s.tipo === "fusionar");
    expect(fus).toBeDefined();
    expect(fus!.hastaCategoryId).toBe("comida");
  });

  it("NO propone fusionar con un sobre de otro frasco", () => {
    const out = detectarOciosos(
      base([
        sobre({ categoryId: "farmacia", frascoId: "vivir", gastoVentana: 10_000 }),
        sobre({ categoryId: "cine", frascoId: "disfrutar", gastoVentana: 400_000 }),
      ]),
    );
    expect(out[0]?.salidas.some((s) => s.tipo === "fusionar")).toBe(false);
  });

  it("NO propone fusionar dos ociosos: daría un sobre más grande que tampoco se usa", () => {
    const out = detectarOciosos(
      base([
        sobre({ categoryId: "a", gastoVentana: 0 }),
        sobre({ categoryId: "b", gastoVentana: 0 }),
      ]),
    );
    expect(out).toHaveLength(2);
    for (const o of out) expect(o.salidas.some((s) => s.tipo === "fusionar")).toBe(false);
  });

  it("'dejarlo' SIEMPRE está: apartar de más puede ser deliberado", () => {
    const solo = detectarOciosos(base([sobre({ categoryId: "unico", gastoVentana: 0 })]));
    expect(solo[0]?.salidas.some((s) => s.tipo === "dejarlo")).toBe(true);
    expect(escenario()[0]?.salidas.some((s) => s.tipo === "dejarlo")).toBe(true);
  });
});

describe("copy", () => {
  const o = () =>
    detectarOciosos(base([sobre({ categoryId: "farmacia", gastoVentana: 12_000 })]))[0]!;

  it("enuncia hechos: cuánto aparta y cuánto usó", () => {
    const t = textoOcioso(o(), fmt);
    expect(t).toContain("CRC100000");
    expect(t).toContain("CRC12000");
    expect(t).toContain(`${OCIOSO_MESES_VENTANA} meses`);
  });

  it("conjuga la voz", () => {
    expect(textoOcioso(o(), fmt, "vos")).toContain("Tenés");
    expect(textoOcioso(o(), fmt, "tu")).toContain("Tienes");
  });

  it("nunca dice que apartar de más esté mal", () => {
    const t = textoOcioso(o(), fmt);
    expect(t).not.toMatch(/desperdici|mal|error|deberías|innecesari/i);
    expect(t).not.toContain("!");
  });

  it("cada salida se explica", () => {
    for (const s of o().salidas) {
      expect(textoSalidaOcioso(s, "CRC", fmt).length).toBeGreaterThan(0);
    }
  });
});

describe("detectSobreOcioso · el insight", () => {
  const ociosos = () =>
    detectarOciosos(
      base([
        sobre({ categoryId: "farmacia", path: "Vivir › Farmacia", gastoVentana: 10_000 }),
        sobre({
          categoryId: "comida",
          path: "Vivir › Comida",
          budgetMensual: 100_000,
          gastoVentana: 400_000,
        }),
      ]),
    );

  it("emite con el diagnóstico y las salidas en el cuerpo", () => {
    const out = detectSobreOcioso({ ociosos: ociosos(), todayIso: "2026-08-13", fmt });
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toContain("Vivir › Farmacia");
    expect(out[0]?.body).toContain("mover");
    expect(out[0]?.body).toContain("fusionarlo con");
  });

  it("es 'info': va por debajo del ritmo y muy por debajo de un sobregiro", () => {
    expect(
      detectSobreOcioso({ ociosos: ociosos(), todayIso: "2026-08-13", fmt })[0]?.severity,
    ).toBe("info");
  });

  it("la clave es MENSUAL: no se repite cada semana sobre datos que no se movieron", () => {
    const enAgosto = (d: string) =>
      detectSobreOcioso({ ociosos: ociosos(), todayIso: d, fmt })[0]?.relatedId;
    expect(enAgosto("2026-08-01")).toBe(enAgosto("2026-08-28"));
    expect(enAgosto("2026-08-28")).not.toBe(enAgosto("2026-09-01"));
    expect(enAgosto("2026-08-13")).toBe("ocioso:farmacia:2026-08");
  });

  it("sin ociosos no emite nada — se auto-resuelve cuando el sobre se empieza a usar", () => {
    expect(detectSobreOcioso({ ociosos: [], todayIso: "2026-08-13", fmt })).toEqual([]);
  });

  it("topea cuántos emite", () => {
    const muchos = detectarOciosos(
      base([
        sobre({ categoryId: "a", gastoVentana: 0 }),
        sobre({ categoryId: "b", gastoVentana: 0 }),
        sobre({ categoryId: "c", gastoVentana: 0 }),
      ]),
    );
    expect(detectSobreOcioso({ ociosos: muchos, todayIso: "2026-08-13", fmt })).toHaveLength(2);
  });

  it("sin salidas posibles igual da el dato, sin fingir una acción", () => {
    const solo = detectarOciosos(base([sobre({ categoryId: "unico", gastoVentana: 0 })]));
    const out = detectSobreOcioso({ ociosos: solo, todayIso: "2026-08-13", fmt });
    expect(out[0]?.body).toContain("puede ir a otro lado");
    expect(out[0]?.body).not.toContain("Podés mover");
  });

  it("integra con la campana: relatedKind válido, clave no-uuid, acción sugerida", () => {
    const i = detectSobreOcioso({ ociosos: ociosos(), todayIso: "2026-08-13", fmt })[0]!;
    expect(INSIGHT_RELATED_KINDS).toContain(i.relatedKind!);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuid.test(i.relatedId!)).toBe(false);
    const a = suggestedAction("sobre_ocioso");
    expect(a?.route).toBe("/gastos");
    expect(a?.label).toContain("fusionar");
  });

  it("tono: sin reproche ni signos de alarma", () => {
    const i = detectSobreOcioso({ ociosos: ociosos(), todayIso: "2026-08-13", fmt })[0]!;
    const texto = `${i.title} ${i.body}`;
    expect(texto).not.toContain("!");
    expect(texto).not.toMatch(/deberías|desperdici|error|mal gastado/i);
  });
});
