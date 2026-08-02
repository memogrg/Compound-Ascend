/**
 * Motor de detalle por dominio (puro): resolución de entidad por nombre, agregación
 * multimoneda y los tres caminos honestos del render (nombre que no resuelve, dominio
 * vacío, y con datos).
 */
import { describe, it, expect } from "vitest";
import {
  normalizar,
  resolverEntidad,
  ordenarYTopear,
  construirDetalle,
  renderDetalle,
  CONSULTAR_DETALLE_TOOL,
  type Entidad,
  type Movimiento,
} from "@/lib/ai/detail-query";

const DEUDAS: Entidad[] = [
  { id: "d1", nombre: "Tarjeta BAC", moneda: "CRC" },
  { id: "d2", nombre: "Préstamo Personal", moneda: "CRC" },
  { id: "d3", nombre: "Tarjeta Scotiabank", moneda: "USD" },
];

const mov = (fecha: string, monto: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  fecha,
  etiqueta: "Pago",
  monto,
  moneda: "CRC",
  ...extra,
});

describe("resolverEntidad", () => {
  it("match exacto gana sobre el parcial", () => {
    const es: Entidad[] = [
      { id: "a", nombre: "Tarjeta" },
      { id: "b", nombre: "Tarjeta BAC" },
    ];
    expect(resolverEntidad("Tarjeta", es)?.id).toBe("a");
  });

  it("ignora tildes y mayúsculas", () => {
    expect(resolverEntidad("prestamo personal", DEUDAS)?.id).toBe("d2");
    expect(resolverEntidad("PRÉSTAMO PERSONAL", DEUDAS)?.id).toBe("d2");
  });

  it("resuelve por substring en ambas direcciones", () => {
    // El usuario escribe menos que el nombre real…
    expect(resolverEntidad("bac", DEUDAS)?.id).toBe("d1");
    // …o más.
    expect(resolverEntidad("mi tarjeta bac credomatic", DEUDAS)?.id).toBe("d1");
  });

  it("devuelve null si no hay match, en vez de adivinar la primera", () => {
    expect(resolverEntidad("hipoteca", DEUDAS)).toBeNull();
  });

  it("un nombre vacío o nulo no resuelve nada", () => {
    expect(resolverEntidad(null, DEUDAS)).toBeNull();
    expect(resolverEntidad("   ", DEUDAS)).toBeNull();
  });

  it("normalizar quita tildes", () => {
    expect(normalizar("Préstamo")).toBe("prestamo");
  });
});

describe("ordenarYTopear", () => {
  it("ordena por fecha descendente (lo más reciente primero)", () => {
    const r = ordenarYTopear([mov("2026-01-01", 1), mov("2026-08-01", 2), mov("2026-04-01", 3)]);
    expect(r.map((m) => m.fecha)).toEqual(["2026-08-01", "2026-04-01", "2026-01-01"]);
  });

  it("aplica el tope y lo acota al máximo", () => {
    const muchos = Array.from({ length: 80 }, (_, i) => mov(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`, i));
    expect(ordenarYTopear(muchos, 3)).toHaveLength(3);
    expect(ordenarYTopear(muchos, 999)).toHaveLength(50);
    expect(ordenarYTopear(muchos, 0)).toHaveLength(1);
  });
});

describe("construirDetalle", () => {
  it("el total se calcula sobre TODOS los movimientos, no solo los listados", () => {
    const movs = Array.from({ length: 20 }, (_, i) => mov(`2026-01-${String(i + 1).padStart(2, "0")}`, 1000));
    const r = construirDetalle(movs, { dominio: "deudas", moneda: "CRC", tope: 5 });
    expect(r.movimientos).toHaveLength(5);
    expect(r.conteo).toBe(20);
    expect(r.total).toBe(20_000); // no 5.000
  });

  it("sin tasas para monedas mixtas no inventa un total", () => {
    const movs = [mov("2026-01-01", 1000, { moneda: "CRC" }), mov("2026-01-02", 10, { moneda: "USD" })];
    const r = construirDetalle(movs, { dominio: "deudas", moneda: "CRC", rates: null });
    expect(r.total).toBeNull();
    expect(r.subtotales).toHaveLength(2);
  });

  it("con tasas sí convierte", () => {
    const movs = [mov("2026-01-01", 1000, { moneda: "CRC" }), mov("2026-01-02", 10, { moneda: "USD" })];
    const r = construirDetalle(movs, {
      dominio: "deudas",
      moneda: "CRC",
      rates: { CRC: 500, USD: 1 },
    });
    expect(r.total).toBe(6000);
  });
});

describe("renderDetalle — los tres caminos honestos", () => {
  it("1) nombre que no resuelve: lo dice y sugiere los que sí existen", () => {
    const r = construirDetalle([], {
      dominio: "deudas",
      entidad: null,
      nombrePedido: "hipoteca",
      moneda: "CRC",
      disponibles: DEUDAS.map((d) => d.nombre),
    });
    const texto = renderDetalle(r);
    expect(texto).toContain("No encontré «hipoteca»");
    expect(texto).toContain("Tarjeta BAC");
    expect(texto.toLowerCase()).not.toContain("no tengo acceso");
  });

  it("2) dominio sin datos: lo dice sin inventar", () => {
    const r = construirDetalle([], { dominio: "dividendos", moneda: "CRC" });
    const texto = renderDetalle(r);
    expect(texto).toContain("Todavía no tenés dividendos cobrados");
    expect(texto.toLowerCase()).not.toContain("no tengo acceso");
  });

  it("2b) entidad resuelta pero sin movimientos la nombra", () => {
    const r = construirDetalle([], {
      dominio: "deudas",
      entidad: DEUDAS[0]!,
      nombrePedido: "bac",
      moneda: "CRC",
    });
    expect(renderDetalle(r)).toContain("Tarjeta BAC");
  });

  it("3) con datos: total + movimientos, y nombra la entidad", () => {
    const movs = [mov("2026-08-01", 50_000), mov("2026-07-01", 50_000)];
    const r = construirDetalle(movs, {
      dominio: "deudas",
      entidad: DEUDAS[0]!,
      nombrePedido: "bac",
      moneda: "CRC",
    });
    const texto = renderDetalle(r);
    expect(texto).toContain("Tarjeta BAC");
    expect(texto).toContain("2026-08-01");
    expect(texto).toContain("2 movimientos");
  });

  it("avisa cuando lista menos de los que contó", () => {
    const movs = Array.from({ length: 30 }, (_, i) => mov(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`, 100));
    const r = construirDetalle(movs, { dominio: "metas", moneda: "CRC", tope: 5 });
    const texto = renderDetalle(r);
    expect(texto).toContain("30 movimientos");
    expect(texto).toContain("Los 5 más recientes");
  });

  it("la nota del movimiento aparece entre paréntesis", () => {
    const r = construirDetalle([mov("2026-08-01", 100_000, { nota: "abono a capital" })], {
      dominio: "deudas",
      moneda: "CRC",
    });
    expect(renderDetalle(r)).toContain("(abono a capital)");
  });

  it("cada dominio usa su propio sustantivo", () => {
    const movs = [mov("2026-08-01", 100)];
    expect(renderDetalle(construirDetalle(movs, { dominio: "metas", moneda: "CRC" }))).toContain("aportes");
    expect(renderDetalle(construirDetalle(movs, { dominio: "inversiones", moneda: "CRC" }))).toContain("compras");
    expect(renderDetalle(construirDetalle(movs, { dominio: "liquidez", moneda: "CRC" }))).toContain("movimientos");
  });
});

describe("declaración de la herramienta", () => {
  it("cubre los cinco dominios auditados", () => {
    expect(CONSULTAR_DETALLE_TOOL.name).toBe("consultar_detalle");
    const props = CONSULTAR_DETALLE_TOOL.parameters.properties as Record<string, { enum?: string[] }>;
    expect(props.dominio?.enum).toEqual([
      "deudas",
      "metas",
      "inversiones",
      "dividendos",
      "liquidez",
    ]);
  });

  it("le prohíbe al modelo responder que no tiene acceso", () => {
    expect(CONSULTAR_DETALLE_TOOL.description).toContain("no tenés acceso");
  });
});
