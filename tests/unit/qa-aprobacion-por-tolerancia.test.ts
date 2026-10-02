/**
 * La aprobación visual, cuando el hash no casa (decisión 52).
 *
 * El sha256 es byte a byte y las capturas no son byte a byte reproducibles. Medido en la corrida
 * `37038208517`: de las 12 capturas aprobadas de la 2.7, **11 casaron y 1 no**
 * (`light/390/ingresos.png`), entre dos corridas cuyo único cambio era el propio fichero de
 * aprobación — que no pinta nada. O sea que la aprobación caducaba por el ruido del renderizador,
 * no porque la pantalla hubiera cambiado, y eso obliga a reaprobar en cada corrida: lo mismo que
 * no tener mecanismo.
 *
 * Así que cuando el hash no casa se mira la IMAGEN aprobada contra la de ahora. Lo que se prueba
 * acá son los cuatro desenlaces de esa mirada, y sobre todo que los dos que NO son «dentro» se
 * distingan: «la pantalla se movió» y «no pude mirar» piden cosas opuestas a quien lee el motivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, vi } from "vitest";
// @ts-expect-error — `.mjs` sin tipos: es un script del arnés, no código de la app.
import { cotejar } from "../../scripts/qa/aprobacion.mjs";
// @ts-expect-error — idem.
import { describirTopes, reprueba } from "../../scripts/qa/veredicto.mjs";

const IMG = "light/390/ingresos.png";
const HASH_APROBADO = "a".repeat(64);
const HASH_AHORA = "b".repeat(64);
const PR = 901;
const CORRIDA = 37038208517;

const aprobacion = {
  pr: PR,
  corrida: CORRIDA,
  capturas: [{ ruta: "/ingresos", tema: "light", ancho: 390, sha256_despues: HASH_APROBADO }],
};

/** El cotejo con un solo reprobado y el hash que se le pase. */
const cotejarCon = (hashAhora: string, compararConAprobada?: unknown) =>
  cotejar({
    reprobadas: [IMG],
    aprobacion,
    hashes: new Map([[IMG, hashAhora]]),
    pr: PR,
    compararConAprobada,
  });

describe("aprobación por tolerancia", () => {
  it("el hash casa: aprobada, y NI SE MIRA la imagen", async () => {
    const mirar = vi.fn();
    const r = await cotejarCon(HASH_APROBADO, mirar);

    expect(r.aprobadas).toEqual([IMG]);
    expect(r.caducadas).toEqual([]);
    expect(r.porTolerancia).toEqual([]);
    // Bajar un artefacto y comparar píxeles para confirmar lo que el hash ya dijo sería gastar
    // medio minuto de CI por captura sin aprender nada.
    expect(mirar, "comparó la imagen aunque el hash ya casaba").not.toHaveBeenCalled();
  });

  it("el hash no casa pero la imagen está dentro de tolerancia: aprobada, y se dice que fue por tolerancia", async () => {
    const r = await cotejarCon(HASH_AHORA, async () => ({
      estado: "dentro",
      detalle: "12 px · delta 1 contra la aprobada",
    }));

    expect(r.aprobadas, "la tolerancia no salvó la aprobación").toEqual([IMG]);
    expect(r.sinAprobar).toEqual([]);
    expect(r.caducadas, "aprobada y caducada a la vez").toEqual([]);
    // El «por qué vale» viaja: la página y el resumen del PR no pueden presentar esto con la
    // misma etiqueta que un hash idéntico, que es una afirmación más fuerte.
    expect(r.porTolerancia).toEqual([
      { imagen: IMG, detalle: "12 px · delta 1 contra la aprobada" },
    ]);
  });

  it("el hash no casa y la imagen tampoco: caducada, con la medida en el motivo", async () => {
    const r = await cotejarCon(HASH_AHORA, async () => ({
      estado: "fuera",
      detalle: "4821 px · delta 97 contra la aprobada",
    }));

    expect(r.aprobadas).toEqual([]);
    expect(r.sinAprobar).toEqual([IMG]);
    expect(r.porTolerancia).toEqual([]);
    expect(r.caducadas).toHaveLength(1);
    // Sin la medida, el motivo no deja decidir si hay que reaprobar o si hay un defecto.
    expect(r.caducadas[0].motivo).toContain("4821 px · delta 97");
    expect(r.caducadas[0].motivo).toContain("la imagen tampoco");
  });

  it("no hay artefacto de la corrida aprobada: caducada diciendo que no se pudo mirar, no que cambió", async () => {
    const r = await cotejarCon(HASH_AHORA, async () => ({
      estado: "sin-artefacto",
      detalle: "la corrida 37038208517 ya no tiene capturas",
    }));

    expect(r.aprobadas).toEqual([]);
    expect(r.caducadas).toHaveLength(1);
    const motivo = r.caducadas[0].motivo as string;
    // Lo que distingue este caso del anterior: acá no se afirma nada sobre la pantalla.
    expect(motivo, "no dice que no hubo con qué comparar").toContain("no hay con qué comparar");
    expect(motivo).toContain("37038208517");
    expect(motivo, "acusa a la pantalla de haberse movido sin haberla mirado").not.toContain(
      "la imagen tampoco",
    );
  });

  it("la captura aprobada no viene en el artefacto: caducada nombrando la corrida", async () => {
    const r = await cotejarCon(HASH_AHORA, async () => ({ estado: "sin-imagen" }));

    expect(r.aprobadas).toEqual([]);
    expect(r.caducadas[0].motivo).toContain(`no está en el artefacto de la corrida ${CORRIDA}`);
  });

  it("sin nadie que mire la imagen, el hash sigue siendo la única vía", async () => {
    // Es el comportamiento de una corrida local y el de antes de la decisión 52: no se inventa
    // una tolerancia cuando no se pasó `--aprobadas`.
    const r = await cotejarCon(HASH_AHORA, undefined);

    expect(r.aprobadas).toEqual([]);
    expect(r.caducadas[0].motivo).toBe("el hash no coincide");
  });
});

describe("un solo criterio de veredicto", () => {
  const topes = { maxDiffPixels: 60, maxDelta: 2 };

  it("reprueba por cantidad o por intensidad, no solo por una", () => {
    expect(reprueba({ diffPixels: 0, maxDelta: 0 }, topes)).toBe(false);
    expect(reprueba({ diffPixels: 60, maxDelta: 2 }, topes), "el tope es inclusivo").toBe(false);
    expect(reprueba({ diffPixels: 61, maxDelta: 1 }, topes)).toBe(true);
    expect(reprueba({ diffPixels: 1, maxDelta: 3 }, topes)).toBe(true);
  });

  it("dos imágenes de distinto tamaño reprueban siempre", () => {
    // No por severidad: sin píxeles comparables, `diffPixels` no significa nada ahí.
    expect(reprueba({ sizeMismatch: true, diffPixels: 0, maxDelta: 0 }, topes)).toBe(true);
  });

  it("los topes se describen igual en todas partes", () => {
    expect(describirTopes(topes)).toBe("hasta 60 px Y delta 2");
  });
});

describe("el criterio no se escribe dos veces", () => {
  const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/qa");
  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("`diff.mjs` importa el veredicto en vez de repetir la comparación", () => {
    const fuente = readFileSync(path.join(RAIZ, "diff.mjs"), "utf8");
    expect(fuente, "no importa el criterio").toContain('from "./veredicto.mjs"');
    // El predicado escrito a mano era `f.diffPixels > maxDiffPixels || f.maxDelta > maxDelta`.
    // Mientras exista ahí, el veredicto y la tolerancia pueden divergir sin que nada avise, y
    // ese fue exactamente el estreno de la sonda: sus propios números, otro criterio.
    expect(
      sinComentarios(fuente),
      "el predicado del veredicto está escrito a mano en `diff.mjs`",
    ).not.toMatch(/diffPixels\s*>\s*maxDiffPixels/);
  });
});
