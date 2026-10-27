/**
 * Guard: el ACCESO se decide con el plan EFECTIVO (`readEffectivePlan` / `getEffectivePlan`,
 * RPC `effective_plan`), nunca leyendo `profiles.plan` directo. Leer el plan propio deja afuera
 * al miembro del hogar de un titular Max+ (B-2), y el bug vuelve en silencio la próxima vez
 * que alguien escriba un muro nuevo «como el de al lado».
 *
 * Se buscan los `.from("profiles").select("…plan…")` literales de `src/` (también partidos en
 * varias líneas). Los únicos permitidos son los que NO deciden acceso: facturación (lo que paga
 * cada uno), la pantalla de cuenta y la capacidad del hogar. Si una entrada de la lista deja de
 * leer el plan, el test también falla: la lista no puede quedar con permisos viejos.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = process.cwd();

const PERMITIDOS: Record<string, string> = {
  "src/modules/account/services/subscription-service.ts": "facturación: estado de la suscripción",
  "src/modules/account/services/stripe-fulfillment.ts": "facturación: cumplimiento de Stripe",
  "src/app/(mobile)/m/(app)/perfil/page.tsx": "facturación: origen de la suscripción",
  "src/modules/account/services/account-service.ts":
    "pantalla de cuenta: plan propio (suscripción); el que se muestra es el efectivo",
  "src/modules/personal-profile/services/household-members-service.ts":
    "capacidad, no acceso: cupo de quien todavía no tiene hogar",
};

const LECTURA_DE_PLAN = /\.from\(\s*["']profiles["']\s*\)\s*\.select\(\s*(["'`])([^"'`]*)\1/g;

function archivos(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const p = join(dir, nombre);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(p);
  }
  return out;
}

function leenPlan(): string[] {
  const encontrados: string[] = [];
  for (const archivo of archivos(join(RAIZ, "src"))) {
    const fuente = readFileSync(archivo, "utf8");
    for (const m of fuente.matchAll(LECTURA_DE_PLAN)) {
      const columnas = m[2]!.split(",").map((c) => c.trim());
      if (columnas.includes("plan")) {
        encontrados.push(relative(RAIZ, archivo).split(sep).join("/"));
        break;
      }
    }
  }
  return encontrados.sort();
}

describe("nadie fuera de facturación decide acceso con profiles.plan", () => {
  const encontrados = leenPlan();

  it("solo los archivos permitidos leen profiles.plan directo", () => {
    const fuera = encontrados.filter((f) => !(f in PERMITIDOS));
    expect(
      fuera,
      "para decidir acceso usá readEffectivePlan/getEffectivePlan (@/lib/auth/effective-plan, feature-gate)",
    ).toEqual([]);
  });

  it("cada permitido sigue leyendo el plan (la lista no guarda permisos viejos)", () => {
    expect(Object.keys(PERMITIDOS).sort()).toEqual(encontrados.filter((f) => f in PERMITIDOS));
  });
});
