/**
 * CORPUS DE INVERSIÓN Y FISCAL — lo que la Biblia no cubría.
 *
 * El resto de la Biblia es guía CONDUCTUAL: cómo hablarle a alguien que le tiene miedo a su plata.
 * Esto es otra cosa — conceptos técnicos y cifras fiscales— y por eso tiene reglas propias que sí
 * vale la pena blindar:
 *
 *  1. TODO CHUNK LLEVA SU DISCLAIMER ADENTRO. No al lado, no en el system prompt: adentro del texto
 *     que se embebe, porque la recuperación semántica trae el chunk suelto y el disclaimer tiene que
 *     viajar con él o no llega nunca.
 *  2. TODA CIFRA FISCAL LLEVA SU PROCEDENCIA. Si el modelo va a decir "15%", tiene que poder decir
 *     de dónde salió y desde cuándo rige, en la misma frase.
 *  3. LA CADUCIDAD SE SUPERFICIA, NO ROMPE EL BUILD. Un test que falle solo un martes cualquiera se
 *     termina silenciando, y la cifra quedaría igual de vieja pero ahora sin nadie mirándola.
 */
import { describe, it, expect } from "vitest";
import {
  FISCAL_CR_CHUNKS,
  INVERSION_CHUNKS,
  fiscalesPorRevisar,
  textoFiscalSembrable,
} from "@/lib/ai/inversion-corpus";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

describe("INVERSION_CHUNKS", () => {
  it("no está vacío y todo chunk tiene keys y contenido", () => {
    expect(INVERSION_CHUNKS.length).toBeGreaterThan(0);
    for (const c of INVERSION_CHUNKS) {
      expect(c.keys.length).toBeGreaterThan(0);
      expect(c.chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it("cada chunk lleva el disclaimer educativo ADENTRO del texto que se embebe", () => {
    for (const c of INVERSION_CHUNKS) {
      expect(c.chunk).toContain("no es una recomendación de inversión");
    }
  });

  it("las keys son minúsculas y sin acentos: el matcher normaliza el texto del usuario, no las keys", () => {
    for (const c of INVERSION_CHUNKS) {
      for (const k of c.keys) {
        expect(k).toBe(k.toLowerCase());
        expect(k.normalize("NFD")).toBe(k);
      }
    }
  });
});

describe("FISCAL_CR_CHUNKS", () => {
  it("toda cifra fiscal arrastra su procedencia y sus dos fechas", () => {
    expect(FISCAL_CR_CHUNKS.length).toBeGreaterThan(0);
    for (const c of FISCAL_CR_CHUNKS) {
      expect(c.fuente.trim().length).toBeGreaterThan(0);
      expect(c.vigenteDesde).toMatch(FECHA);
      expect(c.revisarAntesDe).toMatch(FECHA);
      // Revisar ANTES de una fecha anterior a la de vigencia no querría decir nada.
      expect(c.revisarAntesDe > c.vigenteDesde).toBe(true);
    }
  });

  it("el disclaimer fiscal manda a un profesional: el caso particular manda sobre la regla general", () => {
    for (const c of FISCAL_CR_CHUNKS) {
      expect(c.chunk).toContain("NO es asesoría fiscal");
      expect(c.chunk).toContain("contador");
    }
  });

  it("las keys son minúsculas y sin acentos", () => {
    for (const c of FISCAL_CR_CHUNKS) {
      for (const k of c.keys) {
        expect(k).toBe(k.toLowerCase());
        expect(k.normalize("NFD")).toBe(k);
      }
    }
  });
});

describe("textoFiscalSembrable", () => {
  it("el texto sembrado = contenido + procedencia (la fuente viaja DENTRO del embedding)", () => {
    const c = FISCAL_CR_CHUNKS[0]!;
    const t = textoFiscalSembrable(c);
    expect(t).toContain(c.chunk);
    expect(t).toContain(c.fuente);
    expect(t).toContain(c.vigenteDesde);
    expect(t).toContain(c.revisarAntesDe);
  });

  it("es determinista: el mismo chunk siembra siempre el mismo texto", () => {
    const c = FISCAL_CR_CHUNKS[0]!;
    expect(textoFiscalSembrable(c)).toBe(textoFiscalSembrable(c));
  });
});

describe("fiscalesPorRevisar", () => {
  it("antes de toda fecha de revisión → nada por revisar", () => {
    expect(fiscalesPorRevisar("2020-01-01")).toEqual([]);
  });

  it("pasada la fecha de revisión, el chunk se SUPERFICIA (no rompe nada, avisa)", () => {
    const vencidos = fiscalesPorRevisar("2099-01-01");
    expect(vencidos).toHaveLength(FISCAL_CR_CHUNKS.length);
    for (const v of vencidos) expect(v.revisarAntesDe).toMatch(FECHA);
  });

  it("el corte es estricto: el día mismo de la revisión todavía no cuenta como vencido", () => {
    const c = FISCAL_CR_CHUNKS[0]!;
    const enElDia = fiscalesPorRevisar(c.revisarAntesDe);
    expect(enElDia.some((v) => v.revisarAntesDe === c.revisarAntesDe)).toBe(false);
  });
});
