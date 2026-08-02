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
import { describe, it, expect, beforeAll } from "vitest";
import { ESLint } from "eslint";

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

describe("por qué el guard existe (semántica de JS, sin ESLint de por medio)", () => {
  it("el patrón vetado pierde la forma acentuada", () => {
    expect(/\bqu[eé]\b/i.test("que")).toBe(true);
    expect(/\bqu[eé]\b/i.test("qué")).toBe(false); // ← el bug
  });

  it("sin el \\b de cierre, ambas formas entran", () => {
    expect(/\bqu[eé]/i.test("que")).toBe(true);
    expect(/\bqu[eé]/i.test("qué")).toBe(true);
  });
});
