/**
 * Resolución de un sobre mencionado contra los sobres REALES del usuario.
 * Nada hardcodeado: la lista entra por parámetro, así que un sobre propio se resuelve igual que
 * uno de fábrica. Lo importante es que ACIERTE o SE ABSTENGA — nunca que caiga en "sin filtro".
 */
import { describe, it, expect } from "vitest";
import { matchSobre, normalizarSobre, rutaSobre } from "@/lib/ai/sobre-match";

const SOBRES = [
  { id: "rest", sobre: "Restaurantes", frasco: "Vivir" },
  { id: "transp", sobre: "Transporte", frasco: "Vivir" },
  { id: "super", sobre: "Supermercado", frasco: "Vivir" },
  { id: "corte", sobre: "Corte Pelo David", frasco: "Cuidado personal" },
  { id: "padel", sobre: "Padel", frasco: "Disfrute" },
];

const idOf = (t: string) => {
  const m = matchSobre(t, SOBRES);
  return m.estado === "resuelto" ? m.sobre.id : m.estado;
};

describe("normalizarSobre", () => {
  it("baja, quita acentos y colapsa espacios y puntuación", () => {
    expect(normalizarSobre("  Alimentación  y   Súper! ")).toBe("alimentacion y super");
  });
});

describe("matchSobre · escalón EXACTO", () => {
  it("mismo nombre, sin importar mayúsculas ni acentos", () => {
    expect(idOf("Restaurantes")).toBe("rest");
    expect(idOf("restaurantes")).toBe("rest");
    expect(idOf("RESTAURANTES")).toBe("rest");
  });

  it("singular ↔ plural resuelven al mismo sobre", () => {
    expect(idOf("restaurante")).toBe("rest");
    expect(idOf("supermercados")).toBe("super"); // el sobre es "Supermercado"
  });

  it("también matchea la ruta completa", () => {
    expect(idOf("Vivir › Restaurantes")).toBe("rest");
  });
});

describe("matchSobre · escalón CONTIENE", () => {
  it("un fragmento encuentra el sobre", () => {
    expect(idOf("super")).toBe("super");
    expect(idOf("transp")).toBe("transp");
  });

  it("un término más largo que contiene al nombre también", () => {
    expect(idOf("padel indoor")).toBe("padel");
  });
});

describe("matchSobre · escalón FUZZY por palabras", () => {
  it("un sobre propio de varias palabras se encuentra por parte del nombre", () => {
    expect(idOf("corte pelo")).toBe("corte");
    expect(idOf("corte de pelo")).toBe("corte"); // los conectores no cuentan
  });

  it("el orden de las palabras no importa", () => {
    expect(idOf("david corte")).toBe("corte");
  });
});

describe("matchSobre · se abstiene en vez de adivinar", () => {
  it("ninguno parecido → sin_match (el llamador NO debe traer todo)", () => {
    expect(idOf("criptomonedas")).toBe("sin_match");
    expect(idOf("zzzz")).toBe("sin_match");
  });

  it("varios con la misma fuerza → ambiguo, con sus candidatos", () => {
    const m = matchSobre("seguro", [
      { id: "a", sobre: "Seguro auto", frasco: "Protección" },
      { id: "b", sobre: "Seguro casa", frasco: "Protección" },
    ]);
    expect(m.estado).toBe("ambiguo");
    if (m.estado === "ambiguo") expect(m.candidatos.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("un EXACTO gana: un 'contiene' más flojo no lo vuelve ambiguo", () => {
    const m = matchSobre("Padel", [
      { id: "padel", sobre: "Padel", frasco: null },
      { id: "padel2", sobre: "Padel torneos", frasco: null },
    ]);
    expect(m.estado).toBe("resuelto");
    if (m.estado === "resuelto") expect(m.sobre.id).toBe("padel");
  });

  it("lista vacía o término vacío → sin_match", () => {
    expect(matchSobre("restaurantes", []).estado).toBe("sin_match");
    expect(matchSobre("   ", SOBRES).estado).toBe("sin_match");
  });
});

describe("rutaSobre", () => {
  it("arma «Frasco › Sobre», o solo el sobre si no cuelga de uno", () => {
    expect(rutaSobre({ id: "x", sobre: "Padel", frasco: "Disfrute" })).toBe("Disfrute › Padel");
    expect(rutaSobre({ id: "x", sobre: "Padel", frasco: null })).toBe("Padel");
  });
});
