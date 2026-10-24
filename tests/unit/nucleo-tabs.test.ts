/**
 * Las pestañas del núcleo (`nucleo-tabs-items.ts`) y la subpestaña de Inversiones.
 *
 * Sin RTL ni DOM en vitest, así que se prueba la parte pura: qué enlaces salen, cuál va
 * activo y —lo que más fácil se rompe— qué parámetros conserva cada `href`.
 */
import { describe, it, expect } from "vitest";

import { itemsDePestanas } from "@/components/layout/nucleo-tabs-items";
import { parseSubtab } from "@/modules/wealth/components/portfolio-view";

describe("itemsDePestanas · qué se pinta", () => {
  it("/dashboard → Panel · Acciones · Progreso, con Panel activa", () => {
    const items = itemsDePestanas("/dashboard", null);
    expect(items.map((t) => t.name)).toEqual(["Panel", "Acciones", "Progreso"]);
    expect(items.filter((t) => t.activa).map((t) => t.name)).toEqual(["Panel"]);
  });

  it("/mis-acciones?tab=progreso → Progreso activa, no Acciones", () => {
    const items = itemsDePestanas("/mis-acciones", "tab=progreso");
    expect(items.filter((t) => t.activa).map((t) => t.name)).toEqual(["Progreso"]);
  });

  it("/mis-acciones sin tab → Acciones activa", () => {
    expect(
      itemsDePestanas("/mis-acciones", null)
        .filter((t) => t.activa)
        .map((t) => t.name),
    ).toEqual(["Acciones"]);
  });

  it("/patrimonio/proteccion → Protección activa, NO Inversiones (que es su prefijo)", () => {
    const items = itemsDePestanas("/patrimonio/proteccion", null);
    expect(items.filter((t) => t.activa).map((t) => t.name)).toEqual(["Protección"]);
    expect(items.find((t) => t.name === "Inversiones")?.activa).toBe(false);
  });

  it("/asistente → SIN barra: una sola pestaña no es navegación", () => {
    expect(itemsDePestanas("/asistente", null)).toEqual([]);
  });

  it("una ruta fuera del modelo → sin barra", () => {
    expect(itemsDePestanas("/configuracion", null)).toEqual([]);
    expect(itemsDePestanas("/dev/ui", null)).toEqual([]);
  });

  it("no se pintan las pestañas sin pantalla web (Recurrentes, Libertad)", () => {
    expect(itemsDePestanas("/gastos", null).map((t) => t.name)).toEqual([
      "Resumen",
      "Ingresos",
      "Gastos y sobres",
      "Transacciones",
    ]);
    expect(itemsDePestanas("/mi-rich-life", null).map((t) => t.name)).toEqual([
      "Resumen",
      "Inversiones",
      "Protección",
      "Indicadores",
    ]);
  });

  it("exactamente una pestaña activa, o ninguna", () => {
    for (const [ruta, q] of [
      ["/dashboard", null],
      ["/gastos", null],
      ["/deudas", null],
      ["/mis-acciones", "tab=progreso"],
      ["/patrimonio/proteccion", null],
    ] as const) {
      expect(itemsDePestanas(ruta, q).filter((t) => t.activa).length, ruta).toBeLessThanOrEqual(1);
    }
  });
});

describe("itemsDePestanas · qué arrastra cada enlace", () => {
  it("/gastos?period=2026-08 → TODOS los enlaces llevan period=2026-08", () => {
    const items = itemsDePestanas("/gastos", "period=2026-08");
    expect(items).toHaveLength(4);
    for (const t of items) {
      expect(new URLSearchParams(t.href.split("?")[1]).get("period"), t.name).toBe("2026-08");
    }
  });

  it("sin period en la URL, los href quedan como los declara el modelo", () => {
    expect(itemsDePestanas("/gastos", null).map((t) => t.href)).toEqual([
      "/mi-base-financiera",
      "/ingresos",
      "/gastos",
      "/transacciones",
    ]);
  });

  it("el ?tab= de la pestaña SOBREVIVE al añadir el periodo", () => {
    // El href de Progreso ya trae `?tab=progreso`: añadir el periodo no puede pisarlo.
    const progreso = itemsDePestanas("/dashboard", "period=2026-08").find(
      (t) => t.name === "Progreso",
    );
    const q = new URLSearchParams(progreso!.href.split("?")[1]);
    expect(q.get("tab")).toBe("progreso");
    expect(q.get("period")).toBe("2026-08");
  });

  it("NO propaga otros parámetros: ?deuda= y ?cat= son de su pantalla", () => {
    for (const t of itemsDePestanas("/mis-acciones", "period=2026-08&deuda=abc&cat=xyz")) {
      const q = new URLSearchParams(t.href.split("?")[1]);
      expect(q.get("period"), t.name).toBe("2026-08");
      expect(q.get("deuda"), t.name).toBeNull();
      expect(q.get("cat"), t.name).toBeNull();
    }
  });

  it("un period inválido en la URL se copia tal cual (validarlo es del parser)", () => {
    // `periodParser` ya rechaza lo que no sea YYYY-MM; acá solo se transporta.
    const href = itemsDePestanas("/gastos", "period=basura")[0]!.href;
    expect(href).toContain("period=basura");
  });
});

describe("itemsDePestanas · contadores", () => {
  it("sin badges, ninguna pestaña muestra contador", () => {
    expect(itemsDePestanas("/dashboard", null).every((t) => t.badge === null)).toBe(true);
  });

  it("el contador de «Hoy» va en la pestaña Acciones, no repetido en todas", () => {
    const items = itemsDePestanas("/dashboard", null, { acciones: 3 });
    expect(items.map((t) => t.badge)).toEqual([null, 3, null]);
  });

  it("un 0 no pinta chip", () => {
    expect(
      itemsDePestanas("/dashboard", null, { acciones: 0 }).every((t) => t.badge === null),
    ).toBe(true);
  });
});

describe("parseSubtab (Inversiones)", () => {
  it("acepta los tres valores válidos", () => {
    for (const v of ["portafolio", "calculadora", "monitor"]) {
      expect(parseSubtab(v)).toBe(v);
    }
  });

  it("cae a portafolio con cualquier otra cosa", () => {
    for (const v of ["", "inventado", "PORTAFOLIO", null, undefined]) {
      expect(parseSubtab(v)).toBe("portafolio");
    }
  });
});
