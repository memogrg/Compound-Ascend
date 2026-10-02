/**
 * El cotejo entre lo que el diff reprueba y lo que Memo aprobó.
 *
 * Lo que se prueba acá no es «funciona», es que NO se pueda usar como sello de goma: la
 * aprobación se ata a un PNG concreto (sha256) y a un PR concreto, y una aprobación que ya no
 * corresponde a nada hace fallar en vez de pasar en silencio.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/qa");
// @ts-expect-error — `.mjs` sin tipos: es un script del arnés, no código de la app.
import { cotejar, imagenDeEntrada, partesDeImagen } from "../../scripts/qa/aprobacion.mjs";

const IMG = "light/1280/configuracion.png";
const IMG2 = "dark/768/m_perfil.png";
const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);

const aprobacionDe = (pr: number, capturas: unknown[]) => ({ pr, capturas });
const entrada = (ruta: string, tema: string, ancho: number, sha: string) => ({
  ruta,
  tema,
  ancho,
  sha256_despues: sha,
});

describe("aprobación visual", () => {
  it("traduce entre la entrada legible y el nombre del PNG", () => {
    expect(imagenDeEntrada(entrada("/configuracion", "light", 1280, HASH))).toBe(IMG);
    expect(imagenDeEntrada(entrada("/m/perfil", "dark", 768, HASH))).toBe(IMG2);
    // La raíz no se queda sin nombre: `/` es `home`, como en el resto del arnés.
    expect(imagenDeEntrada(entrada("/", "light", 390, HASH))).toBe("light/390/home.png");
    expect(partesDeImagen(IMG)).toEqual({
      tema: "light",
      ancho: 1280,
      archivo: "configuracion.png",
    });
  });

  it("una captura aprobada con su hash exacto sale del veredicto", () => {
    const r = cotejar({
      reprobadas: [IMG],
      aprobacion: aprobacionDe(899, [entrada("/configuracion", "light", 1280, HASH)]),
      hashes: new Map([[IMG, HASH]]),
      pr: 899,
    });
    expect(r.aprobadas).toEqual([IMG]);
    expect(r.sinAprobar).toEqual([]);
    expect(r.caducadas).toEqual([]);
  });

  it("si el PNG cambió, la aprobación CADUCA y no vale", () => {
    // Es la razón de ser del hash: aprobar «esta pantalla» y no «esta imagen» dejaría cubierto
    // cualquier cambio futuro de esa ruta sin que nadie lo volviera a mirar.
    const r = cotejar({
      reprobadas: [IMG],
      aprobacion: aprobacionDe(899, [entrada("/configuracion", "light", 1280, HASH)]),
      hashes: new Map([[IMG, HASH2]]),
      pr: 899,
    });
    expect(r.aprobadas).toEqual([]);
    expect(r.sinAprobar).toEqual([IMG]);
    expect(r.caducadas).toEqual([{ imagen: IMG, motivo: "el hash no coincide" }]);
  });

  it("una aprobación de OTRO PR no vale", () => {
    const r = cotejar({
      reprobadas: [IMG],
      aprobacion: aprobacionDe(883, [entrada("/configuracion", "light", 1280, HASH)]),
      hashes: new Map([[IMG, HASH]]),
      pr: 899,
    });
    expect(r.prOk).toBe(false);
    expect(r.sinAprobar).toEqual([IMG]);
  });

  it("una aprobación que ya no corresponde a nada hace fallar, no se ignora", () => {
    // Si sobrara en silencio, el fichero se llenaría de aprobaciones viejas y la siguiente
    // persona no sabría cuáles siguen vivas.
    const r = cotejar({
      reprobadas: [],
      aprobacion: aprobacionDe(899, [entrada("/configuracion", "light", 1280, HASH)]),
      hashes: new Map(),
      pr: 899,
    });
    expect(r.aprobadas).toEqual([]);
    expect(r.caducadas).toEqual([{ imagen: IMG, motivo: "ya no se reprueba" }]);
  });

  it("sin fichero de aprobación, todo lo reprobado sigue reprobado", () => {
    const r = cotejar({
      reprobadas: [IMG, IMG2],
      aprobacion: null,
      hashes: new Map([
        [IMG, HASH],
        [IMG2, HASH2],
      ]),
      pr: 899,
    });
    expect(r.sinAprobar).toEqual([IMG, IMG2]);
    expect(r.aprobadas).toEqual([]);
  });

  it("aprobar una y dejar otra sin aprobar no aprueba las dos", () => {
    const r = cotejar({
      reprobadas: [IMG, IMG2],
      aprobacion: aprobacionDe(899, [entrada("/configuracion", "light", 1280, HASH)]),
      hashes: new Map([
        [IMG, HASH],
        [IMG2, HASH2],
      ]),
      pr: 899,
    });
    expect(r.aprobadas).toEqual([IMG]);
    expect(r.sinAprobar).toEqual([IMG2]);
  });
});

/**
 * El campo del marcado se llama igual en los tres sitios que lo tocan.
 *
 * Al pasar el marcado de ruta a imagen me dejé el nombre viejo en la unión de manifiestos de
 * `diff.mjs`, así que `{...todos[0]}` solo arrastraba el del PRIMER shard y la marca de cualquier
 * otro se perdía. Medido: la sonda marcó `light/768/mi-base-financiera.png` en el shard 2 y el
 * diff la reprobó igual, porque leía un campo que ya nadie escribía. Nada falló: simplemente dejó
 * de proteger, que es la forma más cara de romper una guarda.
 */
describe("el marcado de inestables usa un solo nombre", () => {
  const leer = (rel: string) => readFileSync(path.join(RAIZ_SCRIPTS, rel), "utf8");

  it("`marcar-inestables` escribe lo que `diff` lee", () => {
    expect(leer("marcar-inestables.mjs"), "quien escribe").toContain("imagenesInestables");
    expect(leer("diff.mjs"), "quien lee").toContain("imagenesInestables");
  });

  it("no queda ninguna referencia al nombre viejo", () => {
    for (const f of ["marcar-inestables.mjs", "diff.mjs", "comparacion.mjs"])
      expect(leer(f).replace(/\/\*[\s\S]*?\*\//g, ""), `${f} usa el nombre viejo`).not.toContain(
        "rutasInestables",
      );
  });

  it("la unión de manifiestos concatena el campo, no se queda con el del primer shard", () => {
    // `{...todos[0]}` arrastra el del primero; el campo tiene que ir en el `flatMap`.
    expect(leer("diff.mjs")).toMatch(
      /imagenesInestables: todos\.flatMap\(\(m\) => m\.imagenesInestables \?\? \[\]\)/,
    );
  });
});
