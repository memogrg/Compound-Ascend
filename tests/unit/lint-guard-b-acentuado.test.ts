/**
 * La puerta del `\b` acentuado, verificada de verdad: corre ESLint con la config del
 * repo sobre fragmentos y comprueba qué se bloquea y qué pasa.
 *
 * Por qué un test y no confiar en la regla: un guard que deja de matchear no rompe
 * nada — simplemente deja de proteger, en silencio. Este test es lo que avisa si el
 * selector se desafina (un cambio de esquery, de la config plana o del propio patrón).
 *
 * El bug que cierra: en JS `\b` se define sobre [A-Za-z0-9_]. Una vocal acentuada no es
 * `\w`, así que `/\bqu[eé]\b/` matchea "que" y JAMÁS "qué" — el router perdía en
 * silencio justo la forma que la gente escribe.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { ESLint } from "eslint";
import { isMultiPart } from "@/lib/ai/router";

let eslint: ESLint;

/** Mensajes de `no-restricted-syntax` para un fragmento, como si viviera en src/. */
async function guardErrors(code: string, filePath = "src/probe-guard.ts"): Promise<string[]> {
  const [res] = await eslint.lintText(code, { filePath });
  return (res?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-syntax")
    .map((m) => m.message);
}

beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
}, 60_000);

describe("guard del \\b pegado a vocal acentuada", () => {
  it("bloquea el \\b de cierre tras una clase con tilde (el caso del router)", async () => {
    const errs = await guardErrors("export const RE = /\\bqu[eé]\\b/i;");
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("nunca se cumple");
  }, 60_000);

  it("bloquea el \\b de apertura antes de una clase con tilde", async () => {
    expect(await guardErrors("export const RE = /\\b[eé]xito\\b/i;")).toHaveLength(1);
  }, 30_000);

  it("bloquea el \\b pegado a una vocal acentuada suelta", async () => {
    expect(await guardErrors("export const RE = /\\bá\\w+/i;")).toHaveLength(1);
  }, 30_000);

  it("deja pasar el mismo patrón sin el \\b acentuado", async () => {
    expect(await guardErrors("export const RE = /\\bqu[eé]/i;")).toEqual([]);
  }, 30_000);

  it("deja pasar el stem cortado antes de la tilde", async () => {
    expect(await guardErrors("export const RE = /\\brevis\\w*/i;")).toEqual([]);
  }, 30_000);

  it("deja pasar la tilde INTERNA: /\\bc[oó]mo\\b/ sí matchea 'cómo'", async () => {
    // Los \b solo miran los extremos, y ahí hay letras ASCII. No es el anti-patrón.
    expect(await guardErrors("export const RE = /\\bc[oó]mo\\b/i;")).toEqual([]);
    expect(/\bc[oó]mo\b/i.test("¿cómo van mis metas?")).toBe(true);
  }, 30_000);

  it("sigue vigente dentro de src/lib/time, que está exento del OTRO guard", async () => {
    // Ese directorio apaga el veto a todayLocalISO; no debe apagar este de paso.
    const errs = await guardErrors("export const RE = /\\bqu[eé]\\b/i;", "src/lib/time/probe.ts");
    expect(errs).toHaveLength(1);
  }, 30_000);
});

describe("el \\b pegado a un GRUPO (el hueco que dejó pasar el bug del 'sí')", () => {
  // La regla original solo miraba el `\b` pegado DIRECTAMENTE a la vocal o a una clase. En
  // `/\b(s[ií]|dale)\b/` toca el `)` que cierra el grupo, así que pasaba limpio — y un "sí" pelado
  // no confirmaba nada en el chat (#612). El guard se extiende para que no vuelva a colarse.
  it("bloquea el \\b de cierre cuando UNA alternativa termina en clase acentuada", async () => {
    const errs = await guardErrors("export const RE = /\\b(s[ií]|dale)\\b/i;");
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("GRUPO");
  }, 60_000);

  it("bloquea con grupo no-capturante y con la vocal acentuada suelta", async () => {
    expect(await guardErrors("export const RE = /\\b(?:dale|s[ií])\\b/i;")).toHaveLength(1);
    expect(await guardErrors("export const RE = /\\b(hola|holá)\\b/i;")).toHaveLength(1);
  }, 60_000);

  it("bloquea el \\b de apertura cuando el grupo ARRANCA con acento", async () => {
    expect(await guardErrors("export const RE = /\\b([eé]xito|otro)/i;")).toHaveLength(1);
    expect(await guardErrors("export const RE = /\\b(?:[eé]xito|otro)/i;")).toHaveLength(1);
  }, 60_000);

  it("NO marca el grupo cuyas alternativas cierran en ASCII (tilde interna)", async () => {
    // `/\b(cómo|dale)\b/` funciona: los \b miran los extremos y ahí hay letras ASCII.
    expect(await guardErrors("export const RE = /\\b(c[oó]mo|dale)\\b/i;")).toEqual([]);
    expect(/\b(c[oó]mo|dale)\b/i.test("¿cómo van mis metas?")).toBe(true);
  }, 60_000);

  it("NO marca la forma correcta, sin \\b en los extremos", async () => {
    expect(await guardErrors("export const RE = /(?:s[ií]|dale)(?!\\p{L})/iu;")).toEqual([]);
  }, 60_000);
});

describe("los dos defectos VIVOS que destapó el guard extendido", () => {
  // Al correr el lint con el selector nuevo, `router.ts` marcó dos regex que llevaban tiempo en
  // producción fallando en silencio. Se fijan acá para que el arreglo no se revierta.
  it("isMultiPart detecta la pregunta compuesta con «qué» y con «está» acentuados", () => {
    // `…|qu[eé]|est[aá]|…)\b` no se cumplía para esas formas: una pregunta de dos partes NO se
    // detectaba y el router contestaba una sola mitad en vez de escalar.
    expect(isMultiPart("¿cuánto tengo en ahorro y qué aporte me falta?")).toBe(true);
    expect(isMultiPart("¿cuál es mi meta y está al día mi aporte?")).toBe(true);
  });

  it("y sigue sin marcar una pregunta simple", () => {
    expect(isMultiPart("¿cuánto tengo en ahorro?")).toBe(false);
  });

  it("los términos de dominio acentuados ya no pasan como nombre de sobre", () => {
    // El filtro terminaba en `gan[eéoó])\b`: "gané"/"ganó" se colaban como candidatos.
    const RE = /\b(?:pendiente|aporte|inversi|ahorro|deuda|meta|libertad|independencia|ingres|gan[eéoó])(?!\p{L})/iu;
    expect(RE.test("gané")).toBe(true);
    expect(RE.test("ganó")).toBe(true);
    expect(RE.test("gane")).toBe(true);
    expect(RE.test("ganancia")).toBe(false); // no corta una palabra más larga
  });
});

describe("por qué el guard existe (semántica de JS, sin ESLint de por medio)", () => {
  it("el patrón vetado pierde la forma acentuada", () => {
    expect(/\bqu[eé]\b/i.test("que")).toBe(true);
    expect(/\bqu[eé]\b/i.test("qué")).toBe(false); // ← el bug
  });

  it("sin el \\b de cierre, ambas formas entran", () => {
    expect(/\bqu[eé]/i.test("que")).toBe(true);
    expect(/\bqu[eé]/i.test("qué")).toBe(true);
  });

  it("el hueco del GRUPO tenía el mismo efecto", () => {
    expect(/\b(s[ií]|dale)\b/i.test("si")).toBe(true);
    expect(/\b(s[ií]|dale)\b/i.test("sí")).toBe(false); // ← el bug del chat (#612)
  });

  it("la forma que recomienda el mensaje toma las dos", () => {
    expect(/\b(?:s[ií]|dale)(?!\p{L})/iu.test("si")).toBe(true);
    expect(/\b(?:s[ií]|dale)(?!\p{L})/iu.test("sí")).toBe(true);
  });
});
