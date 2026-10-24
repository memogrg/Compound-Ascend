/**
 * La lógica del selector de mes (`src/lib/url-state/period-options.ts`), extraída de
 * `period-selector.tsx` para que el control global de la barra superior v2 use exactamente
 * las mismas opciones.
 *
 * Todo con fecha INYECTADA. Un test que dependiera de `Date.now()` pasaría hoy y fallaría el
 * 1 de enero, o en una máquina en otra zona — y este módulo existe justamente para decidir
 * qué mes se muestra.
 */
import { describe, it, expect } from "vitest";

import {
  BACK_MONTHS,
  FWD_MONTHS,
  buildOptions,
  currentOption,
  labelPeriodo,
  puedeAvanzar,
  puedeRetroceder,
  shiftPeriodo,
} from "@/lib/url-state/period-options";

/** 15 de septiembre de 2026, mediodía: a mitad de mes, para que no roce ningún borde. */
const AHORA = new Date(2026, 8, 15, 12);

describe("labelPeriodo", () => {
  it("da «mes año» con el año completo", () => {
    expect(labelPeriodo("2026-09")).toBe("sep 2026");
    expect(labelPeriodo("2026-01")).toBe("ene 2026");
    expect(labelPeriodo("2025-12")).toBe("dic 2025");
  });

  it("devuelve la cadena tal cual si no es un mes", () => {
    expect(labelPeriodo("cualquiera")).toBe("cualquiera");
    expect(labelPeriodo("")).toBe("");
  });
});

describe("buildOptions", () => {
  it("se ancla al mes REAL, no al seleccionado", () => {
    // Elegir un mes viejo no puede esconder los nuevos: el bug que motivó este anclaje.
    const viejas = buildOptions("2025-11", AHORA);
    const actuales = buildOptions("2026-09", AHORA);
    expect(viejas.map((o) => o.value)).toEqual(actuales.map((o) => o.value));
  });

  it("empieza en el mes futuro y baja: 18 atrás + el actual + 1 adelante", () => {
    const opts = buildOptions("2026-09", AHORA);
    expect(opts).toHaveLength(BACK_MONTHS + 1 + FWD_MONTHS);
    expect(opts[0]?.value).toBe("2026-10"); // el futuro
    expect(opts[1]?.value).toBe("2026-09"); // el actual
    expect(opts.at(-1)?.value).toBe("2025-04"); // 17 hacia atrás
  });

  it("va en orden descendente y sin repetidos", () => {
    const vals = buildOptions("2026-09", AHORA).map((o) => o.value);
    expect([...vals].sort((a, b) => b.localeCompare(a))).toEqual(vals);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it("cruza el año hacia atrás sin saltarse diciembre", () => {
    const vals = buildOptions("2026-09", AHORA).map((o) => o.value);
    expect(vals).toContain("2025-12");
    expect(vals.indexOf("2025-12")).toBe(vals.indexOf("2026-01") + 1);
  });

  it("cruza el año hacia adelante: en diciembre el futuro es enero del siguiente", () => {
    const opts = buildOptions("2026-12", new Date(2026, 11, 10, 12));
    expect(opts[0]?.value).toBe("2027-01");
    expect(opts[1]?.value).toBe("2026-12");
  });

  it("inserta el mes de un deep-link viejo, en su lugar del orden", () => {
    const opts = buildOptions("2019-03", AHORA);
    expect(opts).toHaveLength(BACK_MONTHS + 1 + FWD_MONTHS + 1);
    expect(opts.at(-1)?.value).toBe("2019-03"); // el más antiguo, al final
    const vals = opts.map((o) => o.value);
    expect([...vals].sort((a, b) => b.localeCompare(a))).toEqual(vals);
  });

  it("NO inserta nada si el mes ya está en la ventana", () => {
    expect(buildOptions("2026-05", AHORA)).toHaveLength(BACK_MONTHS + 1 + FWD_MONTHS);
  });

  it("un `current` inválido no rompe ni se inserta", () => {
    const opts = buildOptions("basura", AHORA);
    expect(opts).toHaveLength(BACK_MONTHS + 1 + FWD_MONTHS);
    expect(opts.some((o) => o.value === "basura")).toBe(false);
  });
});

describe("currentOption", () => {
  it("es la opción mínima del primer render", () => {
    expect(currentOption("2026-09")).toEqual({ value: "2026-09", label: "sep 2026" });
  });
});

describe("shiftPeriodo", () => {
  it("avanza y retrocede dentro del año", () => {
    expect(shiftPeriodo("2026-09", -1)).toBe("2026-08");
    expect(shiftPeriodo("2026-09", 1)).toBe("2026-10");
  });

  it("cruza el año en los dos sentidos", () => {
    expect(shiftPeriodo("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriodo("2026-12", 1)).toBe("2027-01");
  });

  it("aguanta saltos grandes", () => {
    expect(shiftPeriodo("2026-09", -12)).toBe("2025-09");
    expect(shiftPeriodo("2026-09", 15)).toBe("2027-12");
  });

  it("ida y vuelta devuelve el mismo mes", () => {
    for (const p of ["2026-01", "2026-09", "2026-12", "2025-06"]) {
      expect(shiftPeriodo(shiftPeriodo(p, -1), 1)).toBe(p);
    }
  });

  it("un valor inválido se devuelve intacto", () => {
    expect(shiftPeriodo("basura", -1)).toBe("basura");
  });
});

describe("puedeAvanzar / puedeRetroceder", () => {
  it("el tope es el mes actual + 1; ahí la flecha se apaga", () => {
    expect(puedeAvanzar("2026-09", AHORA)).toBe(true); // hacia octubre
    expect(puedeAvanzar("2026-10", AHORA)).toBe(false); // octubre ya es el tope
    expect(puedeAvanzar("2026-11", AHORA)).toBe(false); // más allá tampoco
  });

  it("el tope cruza el año", () => {
    const dic = new Date(2026, 11, 10, 12);
    expect(puedeAvanzar("2026-12", dic)).toBe(true); // hacia enero
    expect(puedeAvanzar("2027-01", dic)).toBe(false);
  });

  it("hacia atrás no hay tope: un deep-link viejo sigue navegable", () => {
    expect(puedeRetroceder("2019-03")).toBe(true);
    expect(puedeRetroceder("2026-09")).toBe(true);
  });

  it("un valor inválido no habilita ninguna flecha", () => {
    expect(puedeAvanzar("basura", AHORA)).toBe(false);
    expect(puedeRetroceder("basura")).toBe(false);
  });

  it("el tope coincide con la primera opción del select", () => {
    // Si se separaran, la flecha llevaría a un mes que el menú no ofrece.
    const primera = buildOptions("2026-09", AHORA)[0]!.value;
    expect(puedeAvanzar(primera, AHORA)).toBe(false);
    expect(puedeAvanzar(shiftPeriodo(primera, -1), AHORA)).toBe(true);
  });
});

describe("el módulo es client-safe", () => {
  it("no usa Intl ni server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const fuente = readFileSync(
      path.join(process.cwd(), "src/lib/url-state/period-options.ts"),
      "utf8",
    );
    // `Intl` da separadores y nombres distintos según la versión de ICU: el servidor y el
    // WebView de iOS no coinciden. Misma regla que `format.ts`.
    expect(fuente).not.toMatch(/\bIntl\./);
    expect(fuente).not.toMatch(/^\s*import\s+["']server-only["']/m);
  });
});
