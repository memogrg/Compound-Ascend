import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

// Guarda de higiene del repo público (#chore/higiene-repo-publico). Falla si vuelve a filtrarse:
//   1. un correo de un dominio real (personal) en tests/, scripts/ o .github/, o
//   2. un literal de 32+ caracteres alfanuméricos (forma de clave) fuera de las carpetas permitidas.
// No es un escáner de secretos: es un cerrojo contra reincidencias de lo que ya limpiamos.

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// ── correos personales ──────────────────────────────────────────────────────────
const EMAIL_DIRS = ["tests", "scripts", ".github"];
const REAL_EMAIL = /[A-Za-z0-9._%+-]+@(?:gmail|hotmail|outlook|icloud)\.com\b/gi;
// Único correo de dominio real permitido: el buzón de la cuenta demo (existe TAMBIÉN en
// producción). Es sobreescribible con DEMO_EMAIL_OVERRIDE; cuando la CI pase a demo@ci.local,
// este allowlist debería quedar vacío y el default del seeder mudarse a un dominio sintético.
const EMAIL_ALLOW = new Set([
  "information.theglowup@gmail.com",
  "information.theglowup+marta@gmail.com",
]);

// ── literales con forma de clave ─────────────────────────────────────────────────
const LONG_LITERAL = /['"`]([A-Za-z0-9]{32,})['"`]/g;
// Carpetas permitidas para literales largos: dependencias, lockfiles y capturas de QA.
const LITERAL_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
]);
const LITERAL_SKIP_FILE = (rel: string) =>
  basename(rel) === "package-lock.json" || rel.includes("qa-snapshots");
// Identificadores y vectores de prueba (no secretos) que la regex de 32+ captura de refilón.
const LITERAL_ALLOW = new Set([
  // Identificadores de código (nombres de acciones/funciones) de 32+ letras, no secretos.
  "forceConsistentCasingInFileNames",
  "generateNetWorthSnapshotsForAllUsers",
  "removeOutOfPhaseIncomeLineAction",
  "registerPassiveIncomeWithStubAction",
  "getEntityFallbackBudgetPorPeriodo",
  "generatePortfolioSnapshotsForAllUsers",
  "convertGoalToEmergencyFundAction",
  // Vectores de prueba / hashes de contenido, no secretos.
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", // cabecera JWT de fixture: {"alg":"HS256","typ":"JWT"}
  "86e95ed980127c57331216ae7487dfeccbb10632", // hash de baseline de a11y (docs/qa)
]);

const SCAN_EXT = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".yml",
  ".yaml",
  ".html",
  ".css",
  ".md",
]);

/** Recorre `dir` y entrega los ficheros escaneables (con extensión conocida). */
function* walk(dir: string, skipDirs: Set<string>): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (skipDirs.has(name)) continue;
      yield* walk(full, skipDirs);
    } else if (SCAN_EXT.has(extname(name))) {
      yield full;
    }
  }
}

describe("higiene · correos de dominio real filtrados", () => {
  it("no hay correos personales en tests/, scripts/ ni .github/", () => {
    const offenders: string[] = [];
    for (const dir of EMAIL_DIRS) {
      for (const file of walk(join(REPO_ROOT, dir), new Set(["node_modules", ".git"]))) {
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(REAL_EMAIL)) {
          const addr = m[0].toLowerCase();
          if (!EMAIL_ALLOW.has(addr)) {
            offenders.push(`${relative(REPO_ROOT, file)} → ${m[0]}`);
          }
        }
      }
    }
    expect(offenders, `correos de dominio real filtrados:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("higiene · literales con forma de clave", () => {
  it("no hay literales de 32+ alfanuméricos fuera de las carpetas permitidas", () => {
    const offenders: string[] = [];
    for (const file of walk(REPO_ROOT, LITERAL_SKIP_DIRS)) {
      const rel = relative(REPO_ROOT, file);
      if (LITERAL_SKIP_FILE(rel)) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(LONG_LITERAL)) {
        if (!LITERAL_ALLOW.has(m[1]!)) {
          offenders.push(`${rel} → ${m[1]!.slice(0, 48)}`);
        }
      }
    }
    expect(offenders, `literales con forma de clave:\n${offenders.join("\n")}`).toEqual([]);
  });
});
