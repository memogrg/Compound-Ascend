/**
 * SEGUIMIENTO DE RECOMENDACIONES — el motor puro.
 *
 * Lo que se prueba acá es el criterio que separa a un asesor de un generador de consejos: si mira
 * o no si le hicieron caso. Las tres reglas que más importan y por qué tienen test propio:
 *
 *  1. NO VERIFICABLE ≠ NO CUMPLIDO. Sin línea base no hay delta, y entonces la recomendación queda
 *     abierta — nunca se celebra un avance que no se pudo medir ni se reprocha uno que sí ocurrió.
 *  2. LA CULPA NO EXISTE. Ni siquiera en el caso vencido: la línea retoma, no regaña.
 *  3. LAS CUMPLIDAS VAN PRIMERO. Si solo entra una línea al prompt, tiene que ser la celebración.
 */
import { describe, it, expect } from "vitest";
import {
  DIAS_DE_GRACIA,
  DIAS_PARA_VENCER,
  MAX_SEGUIMIENTO,
  diasEntre,
  resolverSeguimiento,
  resolverTodas,
  verificarCumplimiento,
  type EstadoActual,
  type Recomendacion,
} from "@/lib/ai/coaching-followup";

const rec = (over: Partial<Recomendacion> = {}): Recomendacion => ({
  id: "r1",
  fecha: "2026-01-01",
  summary: "prioridad: fondo de emergencia",
  actionType: "create_goal",
  actionRef: "meta-1",
  actionAmount: 50_000,
  status: "abierta",
  ...over,
});

/**
 * El motor formatea con `toLocaleString("es-CR")`, cuyo separador de miles depende de la versión de
 * ICU del runtime (espacio angosto, punto, coma). Afirmar el símbolo + los dígitos prueba lo que
 * importa —que la cifra es real y va en la moneda del usuario— sin atarse a ese detalle.
 */
const digitos = (s: string): string => s.replace(/\D/g, "");

const estado = (over: Partial<EstadoActual> = {}): EstadoActual => ({
  metas: {},
  deudas: {},
  posiciones: {},
  previo: { metas: {}, deudas: {} },
  ...over,
});

describe("diasEntre", () => {
  it("cuenta días enteros entre dos fechas", () => {
    expect(diasEntre("2026-01-01", "2026-01-08")).toBe(7);
    expect(diasEntre("2026-01-08", "2026-01-01")).toBe(-7);
    expect(diasEntre("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("fecha inválida → 0 (no revienta el turno)", () => {
    expect(diasEntre("no-es-fecha", "2026-01-01")).toBe(0);
  });
});

describe("verificarCumplimiento · metas", () => {
  it("cumplida cuando el avance alcanza el 80% de lo recomendado", () => {
    const e = estado({
      metas: { "meta-1": { nombre: "Fondo", acumulado: 40_000, aporteMensual: null } },
      previo: { metas: { "meta-1": 0 } },
    });
    const v = verificarCumplimiento(rec(), e);
    expect(v).toEqual({ cumplida: true, avance: 40_000, entidad: "Fondo" });
  });

  it("no cumplida por debajo del 80%", () => {
    const e = estado({
      metas: { "meta-1": { nombre: "Fondo", acumulado: 39_999, aporteMensual: null } },
      previo: { metas: { "meta-1": 0 } },
    });
    expect(verificarCumplimiento(rec(), e)?.cumplida).toBe(false);
  });

  it("el avance se mide contra la LÍNEA BASE, no contra el acumulado total", () => {
    // La meta ya tenía ₡100.000 cuando se recomendó: aportar 50.000 la deja en 150.000. Si se
    // midiera el total, cualquier meta con plata previa se daría por cumplida sola.
    const e = estado({
      metas: { "meta-1": { nombre: "Fondo", acumulado: 120_000, aporteMensual: null } },
      previo: { metas: { "meta-1": 100_000 } },
    });
    const v = verificarCumplimiento(rec(), e);
    expect(v).toEqual({ cumplida: false, avance: 20_000, entidad: "Fondo" });
  });

  it("sin línea base → null (no verificable, NO incumplida)", () => {
    const e = estado({
      metas: { "meta-1": { nombre: "Fondo", acumulado: 999_999, aporteMensual: null } },
    });
    expect(verificarCumplimiento(rec(), e)).toBeNull();
  });

  it("la meta ya no existe → null", () => {
    expect(verificarCumplimiento(rec(), estado())).toBeNull();
  });

  it("sin monto recomendado, cualquier avance positivo cuenta ('empezá a aportar')", () => {
    const e = estado({
      metas: { "meta-1": { nombre: "Fondo", acumulado: 1, aporteMensual: null } },
      previo: { metas: { "meta-1": 0 } },
    });
    expect(verificarCumplimiento(rec({ actionAmount: null }), e)?.cumplida).toBe(true);
  });
});

describe("verificarCumplimiento · deudas", () => {
  const deuda = rec({ actionType: "debt_extra_payment", actionRef: "d-1", actionAmount: 100_000 });

  it("cumplida cuando el saldo BAJÓ lo suficiente", () => {
    const e = estado({
      deudas: { "d-1": { nombre: "Tarjeta Oro", saldo: 400_000 } },
      previo: { deudas: { "d-1": 500_000 } },
    });
    expect(verificarCumplimiento(deuda, e)).toEqual({
      cumplida: true,
      avance: 100_000,
      entidad: "Tarjeta Oro",
    });
  });

  it("un saldo que SUBIÓ da avance negativo, nunca cumplida", () => {
    const e = estado({
      deudas: { "d-1": { nombre: "Tarjeta Oro", saldo: 550_000 } },
      previo: { deudas: { "d-1": 500_000 } },
    });
    expect(verificarCumplimiento(deuda, e)).toEqual({
      cumplida: false,
      avance: -50_000,
      entidad: "Tarjeta Oro",
    });
  });
});

describe("verificarCumplimiento · DCA", () => {
  const dca = rec({ actionType: "set_dca", actionRef: "h-1", actionAmount: 200 });

  it("el DCA es una CONFIGURACIÓN: existir con el monto ES el cumplimiento (sin línea base)", () => {
    const e = estado({
      posiciones: { "h-1": { nombre: "VOO", aporteMensual: 200 } },
    });
    expect(verificarCumplimiento(dca, e)).toEqual({ cumplida: true, avance: 200, entidad: "VOO" });
  });

  it("sin aporte configurado → no cumplida", () => {
    const e = estado({ posiciones: { "h-1": { nombre: "VOO", aporteMensual: null } } });
    expect(verificarCumplimiento(dca, e)?.cumplida).toBe(false);
  });
});

describe("verificarCumplimiento · sin seguimiento", () => {
  it("las acciones sin señal limpia de 'se hizo' devuelven null", () => {
    expect(verificarCumplimiento(rec({ actionType: "adjust_budget" }), estado())).toBeNull();
    expect(verificarCumplimiento(rec({ actionType: "move_budget" }), estado())).toBeNull();
  });

  it("sin actionRef o sin actionType → null", () => {
    expect(verificarCumplimiento(rec({ actionRef: null }), estado())).toBeNull();
    expect(verificarCumplimiento(rec({ actionType: null }), estado())).toBeNull();
  });
});

describe("resolverSeguimiento", () => {
  const cumplida = estado({
    metas: { "meta-1": { nombre: "Fondo", acumulado: 50_000, aporteMensual: null } },
    previo: { metas: { "meta-1": 0 } },
  });

  it("dentro de los días de gracia no se evalúa (una recomendación de ayer no tuvo tiempo)", () => {
    const hoy = "2026-01-01";
    const r = resolverSeguimiento(rec({ fecha: hoy }), cumplida, hoy, "CRC");
    expect(r).toEqual({ id: "r1", status: "abierta", linea: null });
    expect(DIAS_DE_GRACIA).toBeGreaterThan(0);
  });

  it("cumplida → línea de celebración CONCRETA, con la cifra y la entidad", () => {
    const r = resolverSeguimiento(rec(), cumplida, "2026-01-10", "CRC");
    expect(r.status).toBe("cumplida");
    expect(r.linea).toContain("Fondo");
    expect(r.linea).toContain("₡");
    expect(digitos(r.linea!)).toContain("50000");
  });

  it("vencida → línea para RETOMAR, jamás un reproche", () => {
    const sinAvance = estado({
      metas: { "meta-1": { nombre: "Fondo", acumulado: 0, aporteMensual: null } },
      previo: { metas: { "meta-1": 0 } },
    });
    const hoy = "2026-03-01"; // > DIAS_PARA_VENCER desde 2026-01-01
    const r = resolverSeguimiento(rec(), sinAvance, hoy, "CRC");
    expect(diasEntre("2026-01-01", hoy)).toBeGreaterThan(DIAS_PARA_VENCER);
    expect(r.status).toBe("vencida");
    expect(r.linea).toContain("SIN reproche");
    // La regla no negociable del producto: el asesor no regaña.
    expect(r.linea).not.toMatch(/deber[íi]as|te lo dije|irresponsable|descuidad/i);
  });

  it("sin avance pero DENTRO del plazo → sigue abierta y sin línea (no se habla por hablar)", () => {
    const sinAvance = estado({
      metas: { "meta-1": { nombre: "Fondo", acumulado: 0, aporteMensual: null } },
      previo: { metas: { "meta-1": 0 } },
    });
    expect(resolverSeguimiento(rec(), sinAvance, "2026-01-10", "CRC")).toEqual({
      id: "r1",
      status: "abierta",
      linea: null,
    });
  });

  it("no verificable y vencida → se deja de seguir, NUNCA se marca incumplida", () => {
    const r = resolverSeguimiento(rec(), estado(), "2026-03-01", "CRC");
    expect(r.status).toBe("sin_seguimiento");
    expect(r.linea).toBeNull();
  });

  it("no verificable dentro del plazo → queda abierta", () => {
    expect(resolverSeguimiento(rec(), estado(), "2026-01-10", "CRC").status).toBe("abierta");
  });

  it("el símbolo sigue a la moneda", () => {
    const r = resolverSeguimiento(rec(), cumplida, "2026-01-10", "USD");
    expect(r.linea).toContain("$");
    expect(digitos(r.linea!)).toContain("50000");
  });
});

describe("resolverTodas", () => {
  it("las CUMPLIDAS van primero: si entra una sola línea, es la celebración", () => {
    const recs: Recomendacion[] = [
      rec({ id: "vencida", fecha: "2026-01-01", actionRef: "meta-vieja" }),
      rec({ id: "cumplida", fecha: "2026-01-01", actionRef: "meta-1" }),
    ];
    const e = estado({
      metas: {
        "meta-1": { nombre: "Fondo", acumulado: 50_000, aporteMensual: null },
        "meta-vieja": { nombre: "Viaje", acumulado: 0, aporteMensual: null },
      },
      previo: { metas: { "meta-1": 0, "meta-vieja": 0 } },
    });
    const { lineas, cambios } = resolverTodas(recs, e, "2026-03-01", "CRC");
    expect(lineas[0]).toContain("Fondo");
    expect(lineas).toHaveLength(2);
    expect(cambios).toEqual(
      expect.arrayContaining([
        { id: "cumplida", status: "cumplida" },
        { id: "vencida", status: "vencida" },
      ]),
    );
  });

  it("corta en MAX_SEGUIMIENTO: es una charla, no un informe", () => {
    const metas: EstadoActual["metas"] = {};
    const previo: Record<string, number> = {};
    const recs: Recomendacion[] = [];
    for (let i = 0; i < MAX_SEGUIMIENTO + 3; i += 1) {
      const ref = `m-${i}`;
      metas[ref] = { nombre: `Meta ${i}`, acumulado: 50_000, aporteMensual: null };
      previo[ref] = 0;
      recs.push(rec({ id: `r-${i}`, actionRef: ref }));
    }
    const { lineas, cambios } = resolverTodas(recs, estado({ metas, previo: { metas: previo } }), "2026-01-10", "CRC");
    expect(lineas).toHaveLength(MAX_SEGUIMIENTO);
    // El corte es de LÍNEAS, no de persistencia: todas las resueltas se marcan igual, o volverían
    // a entrar mañana y el asesor celebraría dos veces lo mismo.
    expect(cambios).toHaveLength(MAX_SEGUIMIENTO + 3);
  });

  it("solo mira las abiertas: lo ya resuelto no vuelve a celebrarse", () => {
    const e = estado({
      metas: { "meta-1": { nombre: "Fondo", acumulado: 50_000, aporteMensual: null } },
      previo: { metas: { "meta-1": 0 } },
    });
    const { lineas, cambios } = resolverTodas([rec({ status: "cumplida" })], e, "2026-01-10", "CRC");
    expect(lineas).toEqual([]);
    expect(cambios).toEqual([]);
  });

  it("sin recomendaciones → sin líneas ni cambios", () => {
    expect(resolverTodas([], estado(), "2026-01-10", "CRC")).toEqual({ lineas: [], cambios: [] });
  });
});
