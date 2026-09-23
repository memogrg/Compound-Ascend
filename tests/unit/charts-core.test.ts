/**
 * El núcleo de gráficos, en lo que se puede probar sin montar nada: el reductor de la serie
 * activa, la descripción accesible, la tabla de datos y la disciplina de tokens del tema.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import {
  ESTADO_INICIAL,
  describirGrafico,
  esVisible,
  opacidadDe,
  reducirSerieActiva,
  seriesVisibles,
  tablaDeDatos,
  SIN_DATO,
  type EstadoSerie,
  type SerieDef,
} from "@/components/charts/core";
import { OPACIDAD } from "@/components/charts/core/theme";

const SERIES: SerieDef[] = [
  { clave: "real", etiqueta: "Real", color: "var(--chart-1)", marca: "area" },
  { clave: "presupuesto", etiqueta: "Presupuesto", color: "var(--chart-3)", marca: "linea" },
  {
    clave: "proyeccion",
    etiqueta: "Proyección",
    color: "var(--chart-4)",
    marca: "linea",
    guion: true,
  },
];

/**
 * Formateador de prueba DETERMINISTA. `toLocaleString("es-CR")` depende del ICU de Node y
 * separa los miles con espacio fino, no con punto: el test comprobaría la biblioteca estándar
 * en vez del código, y fallaría en otra máquina.
 */
const fmt = (v: number) => `₡${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

describe("reducirSerieActiva", () => {
  it("hover activa y salir desactiva", () => {
    const a = reducirSerieActiva(ESTADO_INICIAL, { tipo: "activar", clave: "real" });
    expect(a.activa).toBe("real");
    expect(reducirSerieActiva(a, { tipo: "desactivar" }).activa).toBeNull();
  });

  it("activar la que ya está activa devuelve el MISMO objeto", () => {
    // Importa: un reductor que siempre crea estado nuevo dispara renders y esconde bucles.
    const a = reducirSerieActiva(ESTADO_INICIAL, { tipo: "activar", clave: "real" });
    expect(reducirSerieActiva(a, { tipo: "activar", clave: "real" })).toBe(a);
    expect(reducirSerieActiva(ESTADO_INICIAL, { tipo: "desactivar" })).toBe(ESTADO_INICIAL);
  });

  it("click en la leyenda alterna oculta", () => {
    const uno = reducirSerieActiva(ESTADO_INICIAL, {
      tipo: "alternarOculta",
      clave: "presupuesto",
    });
    expect([...uno.ocultas]).toEqual(["presupuesto"]);
    const dos = reducirSerieActiva(uno, { tipo: "alternarOculta", clave: "presupuesto" });
    expect([...dos.ocultas]).toEqual([]);
  });

  it("una serie oculta no puede quedar activa", () => {
    const activa = reducirSerieActiva(ESTADO_INICIAL, { tipo: "activar", clave: "real" });
    const oculta = reducirSerieActiva(activa, { tipo: "alternarOculta", clave: "real" });
    expect(oculta.activa).toBeNull();
    // Y no se puede activar mientras siga oculta.
    expect(reducirSerieActiva(oculta, { tipo: "activar", clave: "real" }).activa).toBeNull();
  });

  it("Escape limpia el resaltado pero NO reenciende lo apagado", () => {
    // Apagar una serie fue una decisión; deshacerla con una tecla sería una sorpresa.
    let e: EstadoSerie = reducirSerieActiva(ESTADO_INICIAL, {
      tipo: "alternarOculta",
      clave: "proyeccion",
    });
    e = reducirSerieActiva(e, { tipo: "activar", clave: "real" });
    const tras = reducirSerieActiva(e, { tipo: "limpiar" });
    expect(tras.activa).toBeNull();
    expect([...tras.ocultas]).toEqual(["proyeccion"]);
  });

  it("ocultar una serie no cambia el color de ninguna otra", () => {
    // El error clásico: colorear por índice del array visible. Acá el color viaja con la
    // entidad, así que apagar la primera no repinta las que quedan.
    const antes = seriesVisibles(SERIES, ESTADO_INICIAL).map((s) => [s.clave, s.color]);
    const e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "alternarOculta", clave: "real" });
    const despues = seriesVisibles(SERIES, e);
    expect(despues.map((s) => s.clave)).toEqual(["presupuesto", "proyeccion"]);
    for (const s of despues) {
      expect(s.color, s.clave).toBe(antes.find(([k]) => k === s.clave)?.[1]);
    }
  });

  it("opacidad: sin nadie activo todas al 100 %; con una activa, el resto atenuado", () => {
    expect(opacidadDe(ESTADO_INICIAL, "real")).toBe(OPACIDAD.normal);
    const e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "activar", clave: "real" });
    expect(opacidadDe(e, "real")).toBe(OPACIDAD.normal);
    expect(opacidadDe(e, "presupuesto")).toBe(OPACIDAD.atenuada);
    expect(OPACIDAD.atenuada).toBeGreaterThan(0); // atenuar no es ocultar
  });

  it("esVisible refleja las ocultas", () => {
    const e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "alternarOculta", clave: "real" });
    expect(esVisible(e, "real")).toBe(false);
    expect(esVisible(e, "presupuesto")).toBe(true);
  });
});

describe("describirGrafico", () => {
  it("da título, rango y último valor", () => {
    expect(
      describirGrafico({
        titulo: "Patrimonio neto",
        serie: [
          { x: "sep 2025", y: 30_000_000 },
          { x: "sep 2026", y: 34_145_739 },
        ],
        formato: fmt,
      }),
    ).toBe("Patrimonio neto, sep 2025 a sep 2026, último valor ₡34.145.739");
  });

  it("con un solo punto no dice «de X a X»", () => {
    expect(
      describirGrafico({ titulo: "Patrimonio", serie: [{ x: "sep 2026", y: 100 }], formato: fmt }),
    ).toBe("Patrimonio, sep 2026, valor ₡100");
  });

  it("el último valor es el último NO nulo", () => {
    const d = describirGrafico({
      titulo: "Gasto",
      serie: [
        { x: "jul", y: 10 },
        { x: "ago", y: 20 },
        { x: "sep", y: null },
      ],
      formato: fmt,
    });
    expect(d).toBe("Gasto, jul a sep, último valor ₡20");
  });

  it("sin datos lo dice, en vez de inventar un cero", () => {
    expect(describirGrafico({ titulo: "Gasto", serie: [], formato: fmt })).toBe("Gasto, sin datos");
    expect(
      describirGrafico({ titulo: "Gasto", serie: [{ x: "sep", y: null }], formato: fmt }),
    ).toBe("Gasto, sin datos");
  });
});

describe("tablaDeDatos", () => {
  const data = [
    { x: "ene", real: 100, presupuesto: 120, proyeccion: null },
    { x: "feb", real: 90, presupuesto: 120 },
  ];

  it("una columna por serie, en el orden de declaración", () => {
    const t = tablaDeDatos(data, SERIES, fmt);
    expect(t.encabezados).toEqual(["Periodo", "Real", "Presupuesto", "Proyección"]);
    expect(t.filas[0]).toEqual(["ene", "₡100", "₡120", SIN_DATO]);
  });

  it("nulo y ausente se escriben igual: guion, no celda vacía", () => {
    const t = tablaDeDatos(data, SERIES, fmt);
    expect(t.filas[0]![3]).toBe(SIN_DATO); // null explícito
    expect(t.filas[1]![3]).toBe(SIN_DATO); // clave ausente
  });

  it("NaN e Infinity tampoco son números que mostrar", () => {
    const t = tablaDeDatos([{ x: "ene", real: NaN, presupuesto: Infinity }], SERIES, fmt);
    expect(t.filas[0]).toEqual(["ene", SIN_DATO, SIN_DATO, SIN_DATO]);
  });

  it("la etiqueta de la primera columna se puede cambiar", () => {
    expect(tablaDeDatos(data, SERIES, fmt, "Mes").encabezados[0]).toBe("Mes");
  });
});

describe("theme.ts no contiene colores literales", () => {
  it("ningún hex, rgb() ni hsl() fuera de tokens", () => {
    // El tema es el sitio donde alguien escribiría «#378451 y ya». Un color literal acá no
    // cambia con el tema y no aparece en ninguna búsqueda de tokens.
    const fuente = readFileSync(
      path.join(process.cwd(), "src/components/charts/core/theme.ts"),
      "utf8",
    );
    const sospechosos = [
      ...fuente.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
      ...fuente.matchAll(/\b(rgba?|hsla?|oklch)\s*\(/g),
    ].map((m) => m[0]);
    expect(sospechosos, "colores literales en theme.ts").toEqual([]);
  });

  it("todo valor de color apunta a var(--…)", () => {
    const fuente = readFileSync(
      path.join(process.cwd(), "src/components/charts/core/theme.ts"),
      "utf8",
    );
    // Las claves que nombran un color tienen que resolverse con un token.
    for (const [, valor] of fuente.matchAll(/\b\w*[cC]olor\w*:\s*"([^"]+)"/g)) {
      expect(valor, "valor de color sin token").toMatch(/^var\(--/);
    }
  });
});
