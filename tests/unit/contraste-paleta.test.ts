/**
 * El validador de contraste de las paletas de entidad.
 *
 * WCAG 1.4.11 pide **3:1 contra el fondo adyacente** para cualquier objeto gráfico que haga
 * falta para entender el contenido, y una porción de anillo lo es: sin ella no hay dato.
 * Esto no lo cubre `axe` —no sabe que un `fill` de SVG es una porción de dona ni contra qué
 * superficie se recorta—, así que se mide acá.
 *
 * Los valores de los tokens se copian de `tokens.css` a propósito. Leer el CSS en el test
 * obligaría a un parser de `var()` encadenados y a resolver `color-mix` igual que el
 * navegador; con la copia, si alguien cambia un token el test NO se entera — por eso hay un
 * caso que compara la lista contra el fichero y falla si dejaron de coincidir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/** Tokens tal y como están en `src/styles/tokens.css`. */
const TEMAS = {
  claro: {
    surface: "#ffffff",
    bg: "#f4f2ec",
    text: "#1e1c16",
    chart: ["#378451", "#36679b", "#be862d", "#8163b0", "#bc4845", "#0f9aa8"],
  },
  oscuro: {
    surface: "#1e1c16",
    bg: "#15140f",
    text: "#f4f2ec",
    chart: ["#3f9560", "#689ce0", "#c4862c", "#9a7bc7", "#ce605d", "#28a2b0"],
  },
} as const;

type RGB = [number, number, number];
const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

const canal = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminancia = ([r, g, b]: RGB) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

/** Razón de contraste WCAG entre dos colores opacos. */
export function contraste(a: RGB, b: RGB): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return ((x as number) + 0.05) / ((y as number) + 0.05);
}

/** `color-mix(in srgb, C p%, otro)` — mezcla lineal, como la resuelve el navegador. */
const mezclar = (c: RGB, p: number, otro: RGB): RGB =>
  c.map((v, i) => Math.round(v * (p / 100) + otro[i]! * (1 - p / 100))) as RGB;

function lab([r, g, b]: RGB): [number, number, number] {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  const g2 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = g2((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = g2(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = g2((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** ΔE76. El umbral de percepción está en ~2,3; por debajo, dos colores son el mismo. */
export function deltaE(a: RGB, b: RGB): number {
  const [A, B] = [lab(a), lab(b)];
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** Los pasos de la rampa de pasivos, en el mismo orden que `LIAB_COLOR`. */
const RAMPA = [
  { clase: "critico", hacia: "text" as const, pct: 65 },
  { clase: "consumo", hacia: null, pct: 100 },
  { clase: "patrimonial", hacia: "bg" as const, pct: 86 },
  { clase: "productivo", hacia: "bg" as const, pct: 72 },
];

/** Índice de `--chart-N` (1-based) por clase de activo, como en `ASSET_COLOR`. */
const ACTIVOS: Record<string, number> = {
  liquido: 6,
  inversion: 2,
  productivo: 1,
  uso_personal: 3,
  especial: 5,
};

describe.each(Object.entries(TEMAS))("contraste en tema %s", (nombre, T) => {
  const surface = rgb(T.surface);
  const base = rgb(T.chart[3]!); // --chart-4, el tono de la rampa

  const pasos = RAMPA.map((p) => ({
    ...p,
    color: p.hacia === null ? base : mezclar(base, p.pct, rgb(p.hacia === "text" ? T.text : T.bg)),
  }));

  it("cada paso de la rampa de pasivos llega a 3:1 contra la superficie", () => {
    for (const p of pasos) {
      const r = contraste(p.color, surface);
      expect(r, `${nombre} · ${p.clase} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("los pasos contiguos se distinguen a simple vista", () => {
    // Con la rampa anterior (100/74/50/30 % toda hacia `--bg`) los dos últimos pasos ni
    // siquiera llegaban a 3:1 — 2,21 y 1,65 en claro.
    for (let i = 0; i < pasos.length - 1; i++) {
      const d = deltaE(pasos[i]!.color, pasos[i + 1]!.color);
      expect(
        d,
        `${nombre} · ${pasos[i]!.clase}↔${pasos[i + 1]!.clase} → ΔE ${d.toFixed(1)}`,
      ).toBeGreaterThan(5);
    }
  });

  it("más grave es más contraste, y el orden es el mismo en los dos temas", () => {
    // Es lo que hace que la rampa se lea igual en claro y en oscuro sin escribir dos: se
    // mezcla hacia `--text` (máximo contraste de cada tema) y hacia `--bg` (mínimo).
    const razones = pasos.map((p) => contraste(p.color, surface));
    for (let i = 0; i < razones.length - 1; i++) {
      expect(razones[i]!, `${nombre} · paso ${i}`).toBeGreaterThan(razones[i + 1]!);
    }
  });

  it("las clases de activo llegan a 3:1, sin excepciones", () => {
    // Hubo una: `--chart-3` daba 2,99:1 sobre blanco. Se corrigió en el TOKEN, no
    // cambiándole el color a la clase — lo usan todos los gráficos, no solo este anillo.
    for (const [clase, n] of Object.entries(ACTIVOS)) {
      const r = contraste(rgb(T.chart[n - 1]!), surface);
      expect(r, `${nombre} · ${clase} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("los SEIS tokens de gráfico llegan a 3:1, no solo los que usa esta paleta", () => {
    for (let i = 0; i < 6; i++) {
      const r = contraste(rgb(T.chart[i]!), surface);
      expect(r, `${nombre} · --chart-${i + 1} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("no hay dos clases de activo con el mismo color", () => {
    const usados = Object.values(ACTIVOS).map((n) => T.chart[n - 1]);
    expect(new Set(usados).size).toBe(usados.length);
  });
});

describe("la copia de tokens sigue al día", () => {
  it("los valores del test son los de tokens.css", () => {
    // Sin esto, cambiar un token dejaría este validador midiendo colores que ya no existen.
    const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
    // La REGLA, no la primera mención: el comentario de cabecera del fichero ya nombra
    // `[data-theme="dark"]` y partir por ahí dejaba el bloque claro en 263 caracteres.
    const oscuroDesde = css.indexOf('\n[data-theme="dark"] {');
    const claro = css.slice(0, oscuroDesde);
    const oscuro = css.slice(oscuroDesde);

    for (let i = 0; i < 6; i++) {
      expect(claro, `--chart-${i + 1} claro`).toContain(
        `--chart-${i + 1}: ${TEMAS.claro.chart[i]}`,
      );
      expect(oscuro, `--chart-${i + 1} oscuro`).toContain(
        `--chart-${i + 1}: ${TEMAS.oscuro.chart[i]}`,
      );
    }
    expect(claro).toContain(`--surface: ${TEMAS.claro.surface}`);
    expect(oscuro).toContain(`--surface: ${TEMAS.oscuro.surface}`);
  });

  /**
   * La galería `/dev/ui` imprime los hex de la paleta ESCRITOS A MANO, al lado de las
   * muestras que sí salen del token. Cuando los dos dejan de coincidir, la galería —que es
   * justo donde alguien va a mirar cuál es el color de una serie— anuncia un color que la
   * app no usa.
   *
   * No es hipotético: `--chart-3` pasó a `#be862d` en el PR #844 y la tabla se quedó en
   * `#c48a2e`. Nadie lo vio porque la muestra de al lado seguía pintándose bien.
   */
  it("la tabla de /dev/ui declara los MISMOS hex que tokens.css", () => {
    const galeria = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/dev/ui/page.tsx"),
      "utf8",
    );
    const filas = [
      ...galeria.matchAll(/\{ token: "(--chart-\d)", claro: "(#\w{6})", oscuro: "(#\w{6})"/g),
    ];
    expect(filas.length, "no se encontró la tabla SERIES en /dev/ui").toBe(6);

    for (const [, token, claro, oscuro] of filas) {
      const i = Number(token!.slice(-1)) - 1;
      expect(claro, `${token} claro en la galería`).toBe(TEMAS.claro.chart[i]);
      expect(oscuro, `${token} oscuro en la galería`).toBe(TEMAS.oscuro.chart[i]);
    }
  });
});

/**
 * Simulación de daltonismo (Viénot–Brettel en espacio LMS). Devuelve el color tal y como lo
 * percibiría alguien con esa dicromacia.
 */
function comoLoVe([r, g, b]: RGB, tipo: "prot" | "deut" | "trit"): RGB {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const inv = (v: number) =>
    (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
  const [R, G, B] = [f(r), f(g), f(b)];
  const L = 0.31399 * R + 0.63951 * G + 0.04649 * B;
  const M = 0.15537 * R + 0.75789 * G + 0.0867 * B;
  const S = 0.01775 * R + 0.10945 * G + 0.87262 * B;
  let [l, m, s2] = [L, M, S];
  if (tipo === "prot") l = 1.05118294 * M - 0.05116099 * S;
  if (tipo === "deut") m = 0.9513092 * L + 0.04866992 * S;
  if (tipo === "trit") s2 = -0.86744736 * L + 1.86727089 * M;
  return [
    inv(5.47221206 * l - 4.6419601 * m + 0.16963708 * s2),
    inv(-1.1252419 * l + 2.29317094 * m - 0.1678952 * s2),
    inv(0.02980165 * l - 0.19318073 * m + 1.16364789 * s2),
  ].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
}

/** El par más parecido de la paleta, con su ΔE. */
function parMasParecido(
  chart: readonly string[],
  ver: (c: RGB) => RGB = (c) => c,
): { a: number; b: number; d: number } {
  let peor = { a: 0, b: 1, d: Number.POSITIVE_INFINITY };
  for (let i = 0; i < chart.length; i++) {
    for (let j = i + 1; j < chart.length; j++) {
      const d = deltaE(ver(rgb(chart[i]!)), ver(rgb(chart[j]!)));
      if (d < peor.d) peor = { a: i + 1, b: j + 1, d };
    }
  }
  return peor;
}

describe.each(Object.entries(TEMAS))("separación de la paleta en tema %s", (nombre, T) => {
  it("con visión normal, ningún par se confunde", () => {
    const p = parMasParecido(T.chart);
    expect(
      p.d,
      `${nombre} · --chart-${p.a} vs --chart-${p.b} → ΔE ${p.d.toFixed(1)}`,
    ).toBeGreaterThan(20);
  });

  /**
   * Con dicromacia la paleta CUMPLE, y esto es lo que lo sostiene.
   *
   * La versión anterior no cumplía y este caso solo fijaba el piso medido. Tres pares se
   * caían, no uno: `--chart-2`/`--chart-4` (azul y morado) en ΔE 1,2 bajo protanopía
   * oscuro —por debajo del umbral de percepción, o sea el MISMO color—, `--chart-1`/
   * `--chart-5` (el verde y el rojo, la confusión clásica) en 5,3-6,0, y `--chart-1`/
   * `--chart-2` en 3,6 bajo tritanopía. El test viejo solo miraba el mínimo global, así
   * que los otros dos pasaban sin que nadie los viera.
   *
   * Se mide TODO par contra TODO par, no solo los adyacentes: «adyacente» es un orden de
   * la leyenda, no del ojo, y el par que se caía no era adyacente.
   */
  it("con dicromacia, ningún par de la paleta se confunde", () => {
    const visiones = ["prot", "deut", "trit"] as const;
    for (const t of visiones) {
      const p = parMasParecido(T.chart, (c) => comoLoVe(c, t));
      expect(
        p.d,
        `${nombre} · ${t} · --chart-${p.a} vs --chart-${p.b} → ΔE ${p.d.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(8);
    }
  });

  it("y con visión normal tampoco, obviamente", () => {
    const p = parMasParecido(T.chart);
    expect(
      p.d,
      `${nombre} · --chart-${p.a} vs --chart-${p.b} → ΔE ${p.d.toFixed(1)}`,
    ).toBeGreaterThanOrEqual(8);
  });

  it("todos los tokens llegan a 3:1 contra la superficie de tarjeta", () => {
    T.chart.forEach((c, i) => {
      const r = contraste(rgb(c), rgb(T.surface));
      expect(r, `${nombre} · --chart-${i + 1} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    });
  });
});

/**
 * La paleta de NATURALEZAS de gasto (los nueve bloques de la taxonomía).
 *
 * Es una paleta categórica como la de `--chart-N`, y hasta ahora nadie la había medido. Tenía
 * **tres colisiones exactas** —el mismo hex para dos bloques distintos— que ningún test podía
 * ver porque los tokens que las producen son alias: `--c-expense` y `--warn` desembocan los
 * dos en `--s2`, `--c-invest` en `--info` igual que `crecimiento`, y `--teal` en `--s6` igual
 * que `ahorro`. Leyendo `constants.ts` los nueve valores parecen distintos; resueltos, son
 * seis.
 */
const NATURALEZAS = [
  "esencial",
  "estilo_vida",
  "financiero",
  "proteccion",
  "crecimiento",
  "ahorro",
  "inversion",
  "donacion",
  "miscelaneo",
] as const;

/** Los nueve, RESUELTOS a hex, igual que `tokens.css` los resuelve. */
const NATURA = {
  claro: [
    "#be862d",
    "#80913b",
    "#bc4845",
    "#378451",
    "#36679b",
    "#0f9aa8",
    "#8163b0",
    "#981f68",
    "#625e57",
  ],
  oscuro: [
    "#c4862c",
    "#afc167",
    "#ce605d",
    "#3f9560",
    "#689ce0",
    "#28a2b0",
    "#9a7bc7",
    "#d73c99",
    "#a6a199",
  ],
} as const;

describe.each(Object.entries(TEMAS))("paleta de naturalezas en tema %s", (nombre, T) => {
  const paleta = NATURA[nombre as keyof typeof NATURA];

  it("no hay dos bloques con el mismo color", () => {
    const porColor = new Map<string, string[]>();
    paleta.forEach((c, i) => {
      const k = c.toLowerCase();
      porColor.set(k, [...(porColor.get(k) ?? []), NATURALEZAS[i]!]);
    });
    const repetidos = [...porColor.entries()].filter(([, ns]) => ns.length > 1);
    expect(repetidos.map(([c, ns]) => `${c}: ${ns.join(" = ")}`).join(" · ")).toBe("");
  });

  it("los nueve llegan a 3:1 contra la superficie", () => {
    paleta.forEach((c, i) => {
      const r = contraste(rgb(c), rgb(T.surface));
      expect(r, `${nombre} · ${NATURALEZAS[i]} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    });
  });

  it("y con dicromacia ningún par de bloques se confunde", () => {
    for (const t of ["prot", "deut", "trit"] as const) {
      const p = parMasParecido(paleta, (c) => comoLoVe(c, t));
      expect(
        p.d,
        `${nombre} · ${t} · ${NATURALEZAS[p.a - 1]} vs ${NATURALEZAS[p.b - 1]} → ΔE ${p.d.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(8);
    }
  });

  it("la lista del test es la de constants.ts, resuelta", () => {
    // Si alguien cambia `NATURE_COLOR` sin tocar esto, el test dejaría de medir la paleta
    // real. Se comprueba al menos que sigan siendo nueve y en el mismo orden.
    const src = readFileSync(
      join(process.cwd(), "src/modules/financial-base/constants.ts"),
      "utf8",
    );
    const bloque = /export const NATURE_COLOR[\s\S]*?\{([\s\S]*?)\};/.exec(src)?.[1] ?? "";
    const claves = [...bloque.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(claves).toEqual([...NATURALEZAS]);
  });
});
