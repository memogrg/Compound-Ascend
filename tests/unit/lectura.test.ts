/**
 * La aritmética y los adaptadores de las primitivas de lectura.
 *
 * Lo que se vigila acá es lo que puede estar mal SIN QUE SE NOTE: porcentajes que suman 99,
 * un plegado que esconde una fila sin ahorrar nada, un destino inventado en vez del que ya
 * existe en `ACTIONS`, y un color que cambia al reordenar.
 */
import { describe, it, expect } from "vitest";

import {
  plegarOtros,
  porcentajesExactos,
  reducirDesglose,
  filasDelNivel,
  colorDeFila,
  colorDelNivel,
  ESTADO_INICIAL,
  ID_OTROS,
  desdeInsight,
  desdeAction,
  TONO_SEVERIDAD,
  type FilaDesglose,
} from "@/components/lectura";
import { SOBRES } from "@/app/(dashboard)/dev/ui/lectura-datos";
import { suggestedAction } from "@/lib/insights/actions";
import type { DetectedInsight } from "@/lib/insights/types";
import type { Action } from "@/modules/actions/types";

const fila = (id: string, valor: number, color?: string, hijos?: FilaDesglose[]): FilaDesglose => ({
  id,
  etiqueta: id,
  valor,
  color,
  hijos,
});

describe("plegarOtros", () => {
  it("ordena por valor descendente", () => {
    const r = plegarOtros([fila("a", 10), fila("b", 30), fila("c", 20)], 6);
    expect(r.map((f) => f.id)).toEqual(["b", "c", "a"]);
  });

  it("con `max` o menos filas no pliega nada", () => {
    const r = plegarOtros([fila("a", 3), fila("b", 2)], 6);
    expect(r).toHaveLength(2);
    expect(r.some((f) => f.id === ID_OTROS)).toBe(false);
  });

  it("ocho filas con max 6 dan seis más «Otros»", () => {
    const filas = Array.from({ length: 8 }, (_, i) => fila(`f${i}`, 100 - i));
    const r = plegarOtros(filas, 6);
    expect(r).toHaveLength(7);
    expect(r[6]!.id).toBe(ID_OTROS);
    expect(r[6]!.valor).toBe(94 + 93); // las dos últimas
  });

  it("no pliega cuando sobra UNA sola: esconder un nombre sin ahorrar sitio", () => {
    const filas = Array.from({ length: 7 }, (_, i) => fila(`f${i}`, 10 - i));
    const r = plegarOtros(filas, 6);
    expect(r).toHaveLength(7);
    expect(r.some((f) => f.id === ID_OTROS)).toBe(false);
  });

  it("«Otros» conserva las plegadas como hijos: el detalle no se pierde", () => {
    const filas = Array.from({ length: 9 }, (_, i) => fila(`f${i}`, 100 - i));
    const otros = plegarOtros(filas, 6).find((f) => f.id === ID_OTROS)!;
    expect(otros.hijos?.map((h) => h.id)).toEqual(["f6", "f7", "f8"]);
  });

  it("los negativos se ordenan al final pero NO se descartan", () => {
    // Descartarlos dejaría el total sin cuadrar, y eso es peor que verlos.
    const r = plegarOtros([fila("a", 10), fila("neg", -5), fila("b", 20)], 6);
    expect(r.map((f) => f.id)).toEqual(["b", "a", "neg"]);
  });

  it("no muta la entrada", () => {
    const filas = [fila("a", 1), fila("b", 2)];
    plegarOtros(filas, 6);
    expect(filas.map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("porcentajesExactos", () => {
  it("tres tercios suman 100, no 99", () => {
    // Redondeando cada uno por su cuenta daría 33+33+33 = 99.
    const p = porcentajesExactos([1, 1, 1]);
    expect(p.reduce((s, v) => s + v, 0)).toBe(100);
    expect(p).toEqual([34, 33, 33]);
  });

  it("siempre suma 100, con cualquier reparto", () => {
    const casos = [
      [7, 3],
      [1, 1, 1, 1, 1, 1, 1],
      [50, 25, 12, 8, 5],
      [999999, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    ];
    for (const c of casos) {
      expect(
        porcentajesExactos(c).reduce((s, v) => s + v, 0),
        c.join("+"),
      ).toBe(100);
    }
  });

  it("el empate se rompe por orden original, de forma determinista", () => {
    // Dos restos idénticos: gana el primero. Sin esto, las capturas de QA parpadearían.
    expect(porcentajesExactos([1, 1, 1])).toEqual(porcentajesExactos([1, 1, 1]));
    expect(porcentajesExactos([1, 1, 1])[0]).toBe(34);
  });

  it("los ceros se quedan en cero y no roban puntos", () => {
    const p = porcentajesExactos([10, 0, 10]);
    expect(p).toEqual([50, 0, 50]);
  });

  it("todo cero da todo cero, no NaN ni 100", () => {
    // 0/0 no es 100 %: es que no hay base.
    expect(porcentajesExactos([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("un total explícito manda sobre la suma de las filas", () => {
    // Es el caso de un desglose parcial: 30 de un total de 100 es 30 %, no 100 %.
    expect(porcentajesExactos([30], 100)).toEqual([30]);
  });

  it("un desglose PARCIAL no se fuerza a 100", () => {
    // Forzarlo convertiría un 30 % en un 31 % y el número pintado sería mentira. Es el
    // fallo que este test encontró en la primera versión.
    const p = porcentajesExactos([30, 20], 100);
    expect(p).toEqual([30, 20]);
    expect(p.reduce((s, v) => s + v, 0)).toBe(50);
  });

  it("un total explícito IGUAL a la suma sí reparte hasta 100", () => {
    expect(porcentajesExactos([1, 1, 1], 3).reduce((s, v) => s + v, 0)).toBe(100);
  });

  it("los valores no finitos cuentan como cero en vez de propagar NaN", () => {
    expect(porcentajesExactos([10, Number.NaN, 10])).toEqual([50, 0, 50]);
  });
});

describe("reducirDesglose", () => {
  it("seleccionar fija; volver a seleccionar lo mismo suelta", () => {
    const uno = reducirDesglose(ESTADO_INICIAL, { tipo: "seleccionar", id: "a" });
    expect(uno.seleccion).toBe("a");
    expect(reducirDesglose(uno, { tipo: "seleccionar", id: "a" }).seleccion).toBeNull();
  });

  it("seleccionar otra cambia el fijado", () => {
    const uno = reducirDesglose(ESTADO_INICIAL, { tipo: "seleccionar", id: "a" });
    expect(reducirDesglose(uno, { tipo: "seleccionar", id: "b" }).seleccion).toBe("b");
  });

  it("entrar baja de nivel y LIMPIA la selección", () => {
    // Un id del nivel anterior no significa nada en el siguiente: dejaría una fila
    // atenuada sin que nada estuviera fijado.
    const uno = reducirDesglose(ESTADO_INICIAL, { tipo: "seleccionar", id: "a" });
    const dentro = reducirDesglose(uno, { tipo: "entrar", id: "a" });
    expect(dentro.ruta).toEqual(["a"]);
    expect(dentro.seleccion).toBeNull();
  });

  it("subir vuelve un nivel y también limpia", () => {
    const dentro = reducirDesglose(ESTADO_INICIAL, { tipo: "entrar", id: "a" });
    const conSel = reducirDesglose(dentro, { tipo: "seleccionar", id: "a1" });
    const arriba = reducirDesglose(conSel, { tipo: "subir" });
    expect(arriba.ruta).toEqual([]);
    expect(arriba.seleccion).toBeNull();
  });

  it("subir desde la raíz no hace nada", () => {
    expect(reducirDesglose(ESTADO_INICIAL, { tipo: "subir" })).toBe(ESTADO_INICIAL);
  });

  it("limpiar sin selección devuelve el MISMO objeto (no re-renderiza)", () => {
    expect(reducirDesglose(ESTADO_INICIAL, { tipo: "limpiar" })).toBe(ESTADO_INICIAL);
  });
});

describe("filasDelNivel", () => {
  const arbol = [fila("a", 10, undefined, [fila("a1", 6), fila("a2", 4)]), fila("b", 5)];

  it("sin ruta, la raíz", () => {
    expect(filasDelNivel(arbol, []).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("con ruta, los hijos", () => {
    expect(filasDelNivel(arbol, ["a"]).map((f) => f.id)).toEqual(["a1", "a2"]);
  });

  it("una ruta imposible se queda en el último nivel válido, no explota", () => {
    expect(filasDelNivel(arbol, ["b"]).map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("el color sigue a la entidad", () => {
  it("reordenar no cambia el color de ninguna fila", () => {
    const antes = plegarOtros([fila("a", 10, "var(--s1)"), fila("b", 20, "var(--s2)")], 6);
    const despues = plegarOtros([fila("a", 30, "var(--s1)"), fila("b", 20, "var(--s2)")], 6);
    const mapa = (fs: FilaDesglose[]) => Object.fromEntries(fs.map((f) => [f.id, f.color]));
    expect(mapa(despues)).toEqual(mapa(antes));
    // …aunque el orden sí haya cambiado, que es lo que debe cambiar.
    expect(despues.map((f) => f.id)).toEqual(["a", "b"]);
    expect(antes.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("«Otros» no hereda el color de nadie", () => {
    const filas = Array.from({ length: 9 }, (_, i) => fila(`f${i}`, 100 - i, "var(--s1)"));
    expect(plegarOtros(filas, 6).find((f) => f.id === ID_OTROS)!.color).toBeUndefined();
  });
});

describe("la paleta de la demo", () => {
  // La galería es donde se mira si una paleta funciona, así que su propia paleta tiene que
  // cumplir las reglas que predica.
  const visibles = plegarOtros(SOBRES, 6).filter((f) => f.id !== ID_OTROS);

  it("ningún par de sobres del primer nivel comparte color", () => {
    const colores = visibles.map((f) => f.color);
    expect(new Set(colores).size, colores.join(" · ")).toBe(colores.length);
  });

  it("todos son tokens categóricos `--chart-N`, no semánticos", () => {
    // `--c-expense` significa «gasto» y `--c-savings` «ahorro»: usarlos para distinguir
    // sobres entre sí le diría a alguien que Transporte es «ahorro» porque le tocó.
    for (const f of visibles) {
      expect(f.color, f.etiqueta).toMatch(/^var\(--chart-[1-6]\)$/);
    }
  });

  it("los que se pliegan en «Otros» no llevan color", () => {
    const plegados = plegarOtros(SOBRES, 6).find((f) => f.id === ID_OTROS)?.hijos ?? [];
    expect(plegados.length).toBeGreaterThan(0);
    for (const f of plegados) expect(f.color, f.etiqueta).toBeUndefined();
  });

  it("todos los hijos de un nivel comparten el color del padre", () => {
    const padre = SOBRES.find((f) => f.hijos && f.hijos.length > 0)!;
    const delNivel = colorDelNivel(SOBRES, [padre.id]);
    expect(delNivel).toBe(padre.color);
    // Y ninguno trae uno propio que pudiera romper la uniformidad.
    for (const h of padre.hijos!) expect(h.color, h.etiqueta).toBeUndefined();
  });
});

describe("colorDeFila y colorDelNivel", () => {
  const arbol = [
    {
      id: "a",
      etiqueta: "A",
      valor: 10,
      color: "var(--chart-1)",
      hijos: [{ id: "a1", etiqueta: "A1", valor: 6 }],
    },
    { id: "b", etiqueta: "B", valor: 5, color: "var(--chart-2)" },
  ];

  it("encuentra el color de una fila anidada", () => {
    expect(colorDeFila(arbol, "b")).toBe("var(--chart-2)");
    expect(colorDeFila(arbol, "a1")).toBeUndefined();
  });

  it("en la raíz no hay color de nivel: cada fila usa el suyo", () => {
    expect(colorDelNivel(arbol, [])).toBeUndefined();
  });

  it("dentro de un sobre, el nivel toma el color del sobre", () => {
    expect(colorDelNivel(arbol, ["a"])).toBe("var(--chart-1)");
  });

  it("un id que no existe no inventa un color", () => {
    expect(colorDelNivel(arbol, ["zzz"])).toBeUndefined();
  });
});

describe("desdeInsight", () => {
  const base: DetectedInsight = {
    kind: "sobre_sobregirado",
    severity: "accionar",
    title: "Supermercado se pasó del sobre",
    body: "Llevás ₡40.000 por encima de lo asignado.",
    relatedKind: "category",
    relatedId: "cat-1",
  };

  it("la ruta sale de ACTIONS, no de un mapa nuevo", () => {
    expect(desdeInsight(base).evidencia?.href).toBe(suggestedAction("sobre_sobregirado")!.route);
  });

  it("la etiqueta es la de ACTIONS con la mayúscula inicial, y nada más", () => {
    // En `ACTIONS` va en infinitivo y minúscula porque allí se usa dentro de una frase del
    // asesor; acá es un enlace suelto. Se cambia la primera letra y punto: el resto del
    // texto, y sobre todo la RUTA, no se tocan.
    const label = suggestedAction("sobre_sobregirado")!.label;
    const etiqueta = desdeInsight(base).evidencia!.etiqueta;
    expect(etiqueta).toBe(label.charAt(0).toUpperCase() + label.slice(1));
    expect(etiqueta.toLowerCase()).toBe(label.toLowerCase());
  });

  it("conserva severidad, título y causa", () => {
    const it0 = desdeInsight(base);
    expect(it0.severidad).toBe("accionar");
    expect(it0.titulo).toBe(base.title);
    expect(it0.causa).toBe(base.body);
  });

  it("lleva la entidad relacionada, para poder filtrar por ella", () => {
    expect(desdeInsight(base).relacionado).toEqual({ tipo: "category", id: "cat-1" });
  });

  it("sin entidad relacionada, no inventa una", () => {
    const suelto: DetectedInsight = {
      kind: base.kind,
      severity: base.severity,
      title: base.title,
      body: base.body,
    };
    expect(desdeInsight(suelto).relacionado).toBeUndefined();
  });

  it("usa el id persistido cuando existe, y el kind cuando no", () => {
    expect(desdeInsight({ ...base, id: "uuid-1" }).id).toBe("uuid-1");
    expect(desdeInsight(base).id).toBe("sobre_sobregirado");
  });

  it("«accionar» NO se pinta de rojo", () => {
    // La regla del blueprint es «verificables y trazables, nunca alarmistas».
    expect(TONO_SEVERIDAD.accionar).toBe("aviso");
    expect(TONO_SEVERIDAD.celebrar).toBe("acento");
  });
});

describe("desdeAction", () => {
  const base = {
    key: "k",
    kind: "deuda",
    title: "Abonar ₡50.000 a la tarjeta BAC",
    why: "Es la deuda más cara.",
    impact: { kind: "monto", value: 50000, currency: "CRC", label: "Ahorra ₡12.000 en intereses" },
    effort: "2 minutos",
    route: "/deudas",
    teach: "",
    source: "motor",
    weights: {},
  } as unknown as Action;

  it("toma ruta, título e impacto del motor", () => {
    const s = desdeAction(base);
    expect(s.principal).toEqual({
      etiqueta: "Abonar ₡50.000 a la tarjeta BAC",
      href: "/deudas",
      impacto: "Ahorra ₡12.000 en intereses",
    });
  });

  it("una acción bloqueada trae su motivo", () => {
    const s = desdeAction({ ...base, locked: true, lockReason: "Falta registrar el saldo" });
    expect(s.bloqueada).toEqual({ motivo: "Falta registrar el saldo" });
  });

  it("bloqueada sin motivo explícito igual dice algo", () => {
    expect(desdeAction({ ...base, locked: true }).bloqueada?.motivo).toBeTruthy();
  });

  it("sin bloquear, no hay bloqueo", () => {
    expect(desdeAction(base).bloqueada).toBeUndefined();
  });

  it("la pregunta al asesor nombra la acción", () => {
    expect(desdeAction(base).asesor?.pregunta).toContain("Abonar ₡50.000");
  });
});
