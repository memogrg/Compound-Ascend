/**
 * RITMO DE GASTO — motor puro (lib/rhythm/spend-pace.ts).
 *
 * Lo que se vigila acá es la diferencia entre este detector y "avisar al 50%": la señal
 * depende del DÍA. El mismo sobre con el mismo gasto tiene que disparar temprano en el mes y
 * callarse tarde, y hay tests explícitos de las dos mitades.
 *
 * Y se vigila que cada señal traiga SALIDAS. Un aviso sin salida es el antipatrón que este
 * módulo existe para evitar: señala el problema, transfiere la culpa y no ayuda.
 */
import { describe, it, expect } from "vitest";

import {
  RITMO_MARGEN_PUNTOS,
  detectarRitmo,
  textoDiagnostico,
  textoSalida,
  semanaISO,
  type SobrePace,
} from "@/lib/rhythm/spend-pace";

/** Formateador trivial: los tests afirman sobre las CIFRAS, no sobre la coma de miles. */
const fmt = (n: number, c: string) => `${c}${Math.round(n)}`;

const sobre = (over: Partial<SobrePace> & { categoryId: string }): SobrePace => ({
  path: `Vivir › ${over.categoryId}`,
  budget: 400_000,
  spent: 0,
  ...over,
});

describe("detectarRitmo · gastado% contra transcurrido%, no un umbral fijo", () => {
  it("dispara: 50% gastado el día 8 de 30 (27% transcurrido) va 23 puntos adelante", () => {
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "comida", budget: 400_000, spent: 200_000 })],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.puntosAdelante).toBeGreaterThan(RITMO_MARGEN_PUNTOS / 100);
  });

  it("NO dispara con el MISMO 50% el día 20: ahí va al día", () => {
    // Este es el caso que un umbral fijo al 50% castigaría injustamente.
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "comida", budget: 400_000, spent: 200_000 })],
      dia: 20,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(out).toEqual([]);
  });

  it("proyecta con regla de tres: ₡200.000 el día 8 de 30 → ₡750.000", () => {
    // El usuario tiene que poder rehacer la cuenta de cabeza: 200.000 / 8 × 30.
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "comida", budget: 400_000, spent: 200_000 })],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(Math.round(out[0]!.proyeccion)).toBe(750_000);
    expect(Math.round(out[0]!.excesoProyectado)).toBe(350_000);
  });

  it("calla el día 1: cualquier gasto parece infinitamente rápido y el aviso no sirve", () => {
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "comida", budget: 400_000, spent: 390_000 })],
      dia: 1,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(out).toEqual([]);
  });

  it("ignora sobres sin presupuesto: no hay ritmo contra el que medir", () => {
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "x", budget: 0, spent: 100_000 })],
      dia: 10,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(out).toEqual([]);
  });

  it("ignora sobres irrelevantes por PESO, no por monto fijo", () => {
    // La relevancia es una proporción del presupuesto total, así funciona igual en colones
    // que en dólares. Este sobre gasta al 100% pero pesa el 1% del mes.
    const out = detectarRitmo({
      sobres: [
        sobre({ categoryId: "grande", budget: 1_000_000, spent: 100_000 }),
        sobre({ categoryId: "chico", budget: 10_000, spent: 10_000 }),
      ],
      dia: 10,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(out.map((s) => s.categoryId)).not.toContain("chico");
  });

  it("sin presupuesto total no se queda mudo: acepta cualquier sobre con monto", () => {
    // Cuenta recién armada con un solo sobre — el peso relativo no se puede calcular.
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "unico", budget: 50_000, spent: 40_000 })],
      dia: 5,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(out).toHaveLength(1);
  });

  it("ordena por el peor primero", () => {
    const out = detectarRitmo({
      sobres: [
        sobre({ categoryId: "medio", budget: 500_000, spent: 250_000 }),
        sobre({ categoryId: "peor", budget: 500_000, spent: 450_000 }),
      ],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(out[0]?.categoryId).toBe("peor");
  });

  it("el margen es configurable", () => {
    const args = {
      sobres: [sobre({ categoryId: "comida", budget: 400_000, spent: 160_000 })],
      dia: 10,
      diasDelMes: 30,
      currency: "CRC",
    };
    // 40% gastado vs 33% transcurrido = 7 puntos: por debajo del default de 20.
    expect(detectarRitmo(args)).toEqual([]);
    expect(detectarRitmo({ ...args, margenPuntos: 5 })).toHaveLength(1);
  });
});

describe("salidas · estrategia, no culpa", () => {
  const conDonante = () =>
    detectarRitmo({
      sobres: [
        sobre({ categoryId: "comida", path: "Vivir › Comida", budget: 400_000, spent: 200_000 }),
        // Va MUY por debajo del calendario: tiene holgura de sobra para donar.
        sobre({
          categoryId: "transporte",
          path: "Vivir › Transporte",
          budget: 400_000,
          spent: 10_000,
        }),
      ],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });

  it("toda señal ofrece al menos bajar el ritmo y dejarlo así", () => {
    const [senal] = conDonante();
    const tipos = senal!.salidas.map((s) => s.tipo);
    expect(tipos).toContain("bajar_ritmo");
    expect(tipos).toContain("dejarlo");
  });

  it("'dejarlo así' SIEMPRE está: no hacer nada es una decisión válida", () => {
    // Sin donante posible tampoco desaparece — es la salida que evita que el aviso sea un reto.
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "unico", budget: 100_000, spent: 90_000 })],
      dia: 5,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(out[0]?.salidas.some((s) => s.tipo === "dejarlo")).toBe(true);
  });

  it("propone mover desde el sobre con holgura", () => {
    const [senal] = conDonante();
    const mover = senal!.salidas.find((s) => s.tipo === "mover");
    expect(mover).toBeDefined();
    expect(mover!.desdeCategoryId).toBe("transporte");
    expect(mover!.monto).toBeGreaterThan(0);
  });

  it("un sobre que TAMBIÉN va rápido no puede ser donante", () => {
    const out = detectarRitmo({
      sobres: [
        sobre({ categoryId: "comida", budget: 400_000, spent: 200_000 }),
        sobre({ categoryId: "ocio", budget: 400_000, spent: 220_000 }),
      ],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });
    // Los dos disparan → ninguno dona, aunque a los dos "les quede" plata.
    expect(out).toHaveLength(2);
    for (const s of out) expect(s.salidas.some((x) => x.tipo === "mover")).toBe(false);
  });

  it("la holgura descuenta lo que el donante va a seguir gastando, no es su restante", () => {
    // Transporte lleva ₡100.000 de ₡400.000 el día 8 de 30: al ritmo que va terminará en
    // ~₡375.000, así que su holgura real es ~₡25.000 — NO los ₡300.000 que "le quedan".
    const out = detectarRitmo({
      sobres: [
        sobre({ categoryId: "comida", budget: 400_000, spent: 250_000 }),
        sobre({ categoryId: "transporte", budget: 400_000, spent: 100_000 }),
      ],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });
    const mover = out
      .find((s) => s.categoryId === "comida")
      ?.salidas.find((x) => x.tipo === "mover");
    // O no se ofrece (la holgura no cubre un cuarto del exceso) o el monto es chico —
    // en ningún caso son los ₡300.000 del restante bruto.
    if (mover) expect(mover.monto).toBeLessThan(300_000);
  });

  it("no ofrece movimientos simbólicos que ensucian dos presupuestos sin resolver nada", () => {
    const out = detectarRitmo({
      sobres: [
        sobre({ categoryId: "comida", budget: 400_000, spent: 380_000 }), // exceso enorme
        sobre({ categoryId: "chico", budget: 300_000, spent: 290_000 }), // casi sin holgura
      ],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });
    const comida = out.find((s) => s.categoryId === "comida");
    expect(comida?.salidas.some((x) => x.tipo === "mover")).toBe(false);
  });

  it("bajar el ritmo da el número por día", () => {
    const [senal] = conDonante();
    const bajar = senal!.salidas.find((s) => s.tipo === "bajar_ritmo");
    expect(bajar!.diasRestantes).toBe(22);
    expect(Math.round(bajar!.porDia)).toBe(Math.round(200_000 / 22));
  });

  it("el restante de 'bajar el ritmo' nunca es negativo aunque el sobre esté excedido", () => {
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "comida", budget: 100_000, spent: 150_000 })],
      dia: 10,
      diasDelMes: 30,
      currency: "CRC",
    });
    const bajar = out[0]?.salidas.find((x) => x.tipo === "bajar_ritmo");
    expect(bajar!.restante).toBe(0);
    expect(bajar!.porDia).toBe(0);
  });
});

describe("copy", () => {
  const senal = () =>
    detectarRitmo({
      sobres: [
        sobre({ categoryId: "comida", path: "Vivir › Comida", budget: 400_000, spent: 200_000 }),
        sobre({
          categoryId: "transporte",
          path: "Vivir › Transporte",
          budget: 400_000,
          spent: 5_000,
        }),
      ],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    })[0]!;

  it("el diagnóstico enuncia hechos y la proyección, sin adjetivos", () => {
    const t = textoDiagnostico(senal(), 8, fmt);
    expect(t).toContain("CRC200000");
    expect(t).toContain("CRC400000");
    expect(t).toContain("día 8");
    expect(t).toContain("CRC750000");
    expect(t).not.toContain("!");
    expect(t).not.toMatch(/cuidado|demasiado|excesivo/i);
  });

  it("conjuga la voz del diagnóstico", () => {
    expect(textoDiagnostico(senal(), 8, fmt, "vos")).toContain("Llevás");
    expect(textoDiagnostico(senal(), 8, fmt, "tu")).toContain("Llevas");
    expect(textoDiagnostico(senal(), 8, fmt, "vos")).toContain("llegás");
    expect(textoDiagnostico(senal(), 8, fmt, "tu")).toContain("llegas");
  });

  it("cada salida se explica con sus cifras", () => {
    const s = senal();
    for (const salida of s.salidas) {
      expect(textoSalida(salida, s.currency, fmt).length).toBeGreaterThan(0);
    }
    const bajar = s.salidas.find((x) => x.tipo === "bajar_ritmo")!;
    expect(textoSalida(bajar, s.currency, fmt)).toContain("por día");
  });

  it("concuerda 'día'/'días' en la salida de bajar el ritmo", () => {
    // El día 29 de 30 el transcurrido ya es 96,7%, así que la ÚNICA forma de que dispare tan
    // tarde es estar excedido (116,7%+). Ese es justo el caso de un solo día restante, y por
    // eso el singular existe.
    const out = detectarRitmo({
      sobres: [sobre({ categoryId: "comida", budget: 400_000, spent: 480_000 })],
      dia: 29,
      diasDelMes: 30,
      currency: "CRC",
    });
    const bajar = out[0]?.salidas.find((x) => x.tipo === "bajar_ritmo");
    expect(bajar).toBeDefined();
    expect(bajar!.diasRestantes).toBe(1);
    expect(textoSalida(bajar!, "CRC", fmt)).toContain("para 1 día");
  });
});

describe("semanaISO · el tope de un aviso por sobre por semana", () => {
  it("días de la misma semana comparten clave", () => {
    // Lunes 10 a domingo 16 de agosto de 2026.
    expect(semanaISO("2026-08-10")).toBe(semanaISO("2026-08-16"));
  });

  it("el lunes siguiente cambia la clave — el aviso vuelve a ser legítimo", () => {
    expect(semanaISO("2026-08-16")).not.toBe(semanaISO("2026-08-17"));
  });

  it("formato estable YYYY-Www", () => {
    expect(semanaISO("2026-08-13")).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("resuelve el cambio de año sin inventar la semana 53", () => {
    // El 1 de enero de 2027 es viernes → pertenece a la semana 53 de 2026 por la norma ISO.
    expect(semanaISO("2027-01-01")).toBe("2026-W53");
    // Y el 4 de enero (lunes) ya es la semana 1 de 2027.
    expect(semanaISO("2027-01-04")).toBe("2027-W01");
  });
});

/**
 * LA MONEDA DEL SOBRE también en los avisos de ritmo. Es el mismo bug que el restante: un sobre
 * configurado en ₡445.000 avisaba "llevás $200 de $445" porque la señal tomaba la moneda de
 * VISUALIZACIÓN. Y las salidas no pueden mover plata entre monedas distintas: sería una
 * conversión con una tasa adentro, y el texto quedaría con dos símbolos en la misma frase.
 */
describe("moneda del sobre en las señales de ritmo", () => {
  const dia = 10;
  const diasDelMes = 30;

  it("la señal sale en la moneda del SOBRE, no en la de visualización", () => {
    const senales = detectarRitmo({
      dia,
      diasDelMes,
      currency: "USD", // visualización
      sobres: [
        {
          categoryId: "s-rest",
          path: "Vivir › Restaurantes",
          budget: 445_000,
          spent: 300_000,
          currency: "CRC",
          pesoBudget: 890,
        },
      ],
    });
    expect(senales).toHaveLength(1);
    expect(senales[0]?.currency).toBe("CRC");
    expect(senales[0]?.budget).toBe(445_000);
    expect(senales[0]?.spent).toBe(300_000);
  });

  it("sin `currency` en el sobre se cae a la de visualización (comportamiento anterior)", () => {
    const senales = detectarRitmo({
      dia,
      diasDelMes,
      currency: "CRC",
      sobres: [
        { categoryId: "s-rest", path: "Vivir › Restaurantes", budget: 100_000, spent: 70_000 },
      ],
    });
    expect(senales[0]?.currency).toBe("CRC");
  });

  it("el PESO relativo sí cruza monedas: usa `pesoBudget` convertido", () => {
    // Sin `pesoBudget`, el sobre en dólares ($500) parecería un 0,1% del total al lado del de
    // colones (₡500.000) y nunca pasaría el peso mínimo, aunque valen lo mismo.
    const senales = detectarRitmo({
      dia,
      diasDelMes,
      currency: "CRC",
      sobres: [
        {
          categoryId: "s-usd",
          path: "Vivir › Suscripciones",
          budget: 500,
          spent: 400,
          currency: "USD",
          pesoBudget: 250_000,
        },
        {
          categoryId: "s-crc",
          path: "Vivir › Súper",
          budget: 250_000,
          spent: 50_000,
          currency: "CRC",
          pesoBudget: 250_000,
        },
      ],
    });
    expect(senales.map((s) => s.categoryId)).toContain("s-usd");
  });

  it("solo dona un sobre de la MISMA moneda: nunca se propone mover ₡ a un sobre en $", () => {
    const senales = detectarRitmo({
      dia,
      diasDelMes,
      currency: "CRC",
      sobres: [
        // Apretado, en dólares.
        {
          categoryId: "s-usd",
          path: "Vivir › Suscripciones",
          budget: 500,
          spent: 400,
          currency: "USD",
          pesoBudget: 250_000,
        },
        // Con holgura, pero en COLONES: no puede donarle al de arriba.
        {
          categoryId: "s-crc",
          path: "Vivir › Súper",
          budget: 250_000,
          spent: 10_000,
          currency: "CRC",
          pesoBudget: 250_000,
        },
      ],
    });
    const apretado = senales.find((s) => s.categoryId === "s-usd");
    expect(apretado).toBeDefined();
    expect(apretado?.salidas.some((x) => x.tipo === "mover")).toBe(false);
    // Las otras dos salidas siguen ahí: la señal nunca queda sin salida.
    expect(apretado?.salidas.map((x) => x.tipo)).toEqual(["bajar_ritmo", "dejarlo"]);
  });

  it("con un donante de la misma moneda, la salida `mover` sí aparece", () => {
    const senales = detectarRitmo({
      dia,
      diasDelMes,
      currency: "CRC",
      sobres: [
        {
          categoryId: "s-a",
          path: "Vivir › Restaurantes",
          budget: 100_000,
          spent: 80_000,
          currency: "CRC",
          pesoBudget: 100_000,
        },
        {
          categoryId: "s-b",
          path: "Vivir › Súper",
          budget: 200_000,
          spent: 10_000,
          currency: "CRC",
          pesoBudget: 200_000,
        },
      ],
    });
    const apretado = senales.find((s) => s.categoryId === "s-a");
    expect(apretado?.salidas.some((x) => x.tipo === "mover")).toBe(true);
  });
});
