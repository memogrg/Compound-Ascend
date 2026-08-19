/**
 * FECHA dicha en lenguaje natural → ISO.
 *
 * El caso que la trajo: "…el día 2 de agosto" se ignoraba y el gasto quedaba fechado hoy, en otro
 * mes y en otro presupuesto. Se prueban los formatos soportados, la inferencia del año (un gasto
 * es pasado) y —lo más importante— el tercer estado: dijo una fecha y NO se pudo interpretar, que
 * es lo que nunca puede volver a resolverse en silencio.
 */
import { describe, it, expect } from "vitest";
import { extractFechaNatural, fechaLegible, mesLegible } from "@/lib/ai/fecha-natural";

const HOY = "2026-08-18";

describe("extractFechaNatural · formatos", () => {
  it('"el día 2 de agosto" → 2026-08-02 (la frase exacta del bug)', () => {
    const f = extractFechaNatural(
      "Agrega un gasto a transporte de vehículo de 37747 el día 2 de agosto",
      HOY,
    );
    expect(f?.iso).toBe("2026-08-02");
  });

  it('"el 2 de agosto" sin la palabra "día"', () => {
    expect(extractFechaNatural("gasté 5000 el 2 de agosto", HOY)?.iso).toBe("2026-08-02");
  });

  it("ISO explícito y dd/mm (es-CR: el día va primero)", () => {
    expect(extractFechaNatural("un gasto de 900 el 2026-08-02", HOY)?.iso).toBe("2026-08-02");
    expect(extractFechaNatural("un gasto de 900 el 02/08", HOY)?.iso).toBe("2026-08-02");
    expect(extractFechaNatural("un gasto de 900 el 02/08/2025", HOY)?.iso).toBe("2025-08-02");
  });

  it("relativos: hoy / ayer / anteayer, contra el hoy del PERFIL", () => {
    expect(extractFechaNatural("gasté 3000 hoy", HOY)?.iso).toBe("2026-08-18");
    expect(extractFechaNatural("gasté 3000 ayer", HOY)?.iso).toBe("2026-08-17");
    expect(extractFechaNatural("gasté 3000 anteayer", HOY)?.iso).toBe("2026-08-16");
  });

  it('"el 15" = el 15 de este mes; si todavía no llegó, el del mes pasado', () => {
    expect(extractFechaNatural("anotá 4000 el 15", HOY)?.iso).toBe("2026-08-15");
    // El 30 de agosto todavía no llegó el 18: el gasto es del 30 de julio.
    expect(extractFechaNatural("anotá 4000 el 30", HOY)?.iso).toBe("2026-07-30");
  });

  it("día+mes sin año que aún no llegó → el año pasado (un gasto ya ocurrió)", () => {
    expect(extractFechaNatural("gasté 1000 el 5 de diciembre", HOY)?.iso).toBe("2025-12-05");
  });

  it("mes + día en el orden inverso", () => {
    expect(extractFechaNatural("gasté 1000 agosto 3", HOY)?.iso).toBe("2026-08-03");
  });
});

describe("extractFechaNatural · lo que NO se pudo leer", () => {
  it("una fecha imposible se reporta, no se ignora", () => {
    const f = extractFechaNatural("gasté 1000 el 31 de febrero", HOY);
    expect(f?.iso).toBeNull();
    expect(f && "motivo" in f ? f.motivo : null).toBe("invalida");
  });

  it("una fecha futura se reporta como futura (un gasto no puede serlo)", () => {
    const f = extractFechaNatural("gasté 1000 el 2027-01-05", HOY);
    expect(f?.iso).toBeNull();
    expect(f && "motivo" in f ? f.motivo : null).toBe("futura");
  });

  it("un mes suelto sin día es una fecha que no se pudo precisar → se avisa", () => {
    const f = extractFechaNatural("gasté 1000 en restaurantes en agosto", HOY);
    expect(f?.iso).toBeNull();
  });

  it("sin ninguna señal de fecha devuelve null (ahí hoy es el default legítimo)", () => {
    expect(extractFechaNatural("gasté 5000 en el súper", HOY)).toBeNull();
    // "2 de mis sobres" no es una fecha: sin el artículo delante no hay pista.
    expect(extractFechaNatural("repartí 5000 en 2 de mis sobres", HOY)).toBeNull();
  });
});

describe("fechaLegible / mesLegible", () => {
  it("dicen la fecha en palabras", () => {
    expect(fechaLegible("2026-08-02")).toBe("2 de agosto de 2026");
    expect(mesLegible("2026-08-02")).toBe("agosto 2026");
  });
});
