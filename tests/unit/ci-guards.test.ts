/**
 * Los guards del CI no pueden desactivarse en silencio.
 *
 * Contexto: el job E2E vivía con `continue-on-error: true`. El día que atrapó un
 * bug real —una migración que dejaba `handle_new_user` lanzando, con lo cual
 * NINGÚN usuario podía registrarse— el job dio `failure` y el workflow reportó
 * `success` igual. Un guard que mira para otro lado es peor que no tenerlo:
 * ocupa el lugar de la comprobación que sí habría bloqueado.
 *
 * Este test vigila el archivo del workflow. No puede comprobar la otra mitad
 * —que el check esté marcado como REQUERIDO en branch protection—, porque eso
 * vive en la configuración del repositorio y no en el código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const CI = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

/** Quita los comentarios: lo que se mide son directivas, no la documentación. */
const DIRECTIVAS = CI.split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

describe("ningún job del CI se salta su propio veredicto", () => {
  it("no hay `continue-on-error: true` en ningún job", () => {
    // Es la directiva que hace que un job en failure no tumbe el workflow.
    expect(DIRECTIVAS).not.toMatch(/continue-on-error:\s*true/);
  });

  it("ningún paso ignora su fallo con `|| true`", () => {
    // La otra forma de enmascarar: un comando que siempre sale con 0.
    expect(DIRECTIVAS).not.toMatch(/\|\|\s*true\s*$/m);
  });
});

describe("los tres guards siguen existiendo", () => {
  const ESPERADOS = [
    "Lint, Typecheck, Test & Build",
    "Migraciones aplican en BD fresca",
    "E2E smoke",
  ];

  it("los tres jobs están declarados con su nombre", () => {
    // El nombre es lo que branch protection referencia: renombrarlo sin más
    // desengancha el check requerido y el guard deja de bloquear en la práctica.
    for (const nombre of ESPERADOS) {
      expect(DIRECTIVAS, `falta el job "${nombre}"`).toContain(`name: ${nombre}`);
    }
  });

  it("el E2E ya no se anuncia como no bloqueante", () => {
    // El nombre viejo ("E2E smoke (no bloqueante por ahora)") decía la verdad
    // cuando lo era. Ahora sería una mentira, y el nombre es lo que se lee en el PR.
    expect(CI).not.toContain("no bloqueante por ahora");
  });

  it("el E2E corre en los pull requests, que es donde tiene que bloquear", () => {
    const bloque = DIRECTIVAS.slice(DIRECTIVAS.indexOf("  e2e:"));
    expect(bloque).toContain("github.event_name == 'pull_request'");
  });
});
