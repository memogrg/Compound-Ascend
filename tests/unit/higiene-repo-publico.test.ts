import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

// Guarda de higiene del repo público (#chore/higiene-repo-publico). Falla si vuelve a filtrarse:
//   1. un correo de un dominio real (personal) en tests/, scripts/ o .github/, o
//   2. un literal de 32+ caracteres alfanuméricos (forma de clave) fuera de las carpetas permitidas.
// No es un escáner de secretos: es un cerrojo contra reincidencias de lo que ya limpiamos.
//
// ── Lo que se inspecciona es GIT, no el disco ──────────────────────────────────────────────
//
// Esto recorría el árbol de trabajo, y por eso se ponía rojo en la máquina de Memo por ficheros
// que no van a entrar al repo nunca: worktrees de otras sesiones (`.claude/worktrees/**`), los
// Pods de iOS, notas locales (`docs/apple-app-store/**`) y una copia de un handoff de diseño.
// Comprobado con `git ls-files --error-unmatch`: ninguno estaba versionado. En CI pasaba solo
// porque allá esos ficheros no existen — o sea que la guarda daba verde por accidente y rojo por
// accidente, y lo segundo entrena a ignorar una guarda de fugas, que es peor que no tenerla.
//
// Lo que puede filtrarse es lo que se publica, así que la lista sale del ÍNDICE de git
// (`git ls-files`): lo rastreado y lo que ya está en `git add`. Un fichero stageado SÍ se
// inspecciona —ahí es donde hay que cazarlo, antes del commit— y uno sin versionar no, porque no
// va a ningún sitio. De paso desaparece la lista de carpetas a saltar: `node_modules`, `.next`,
// `dist`, `build` y `coverage` no están en el índice (medido: 0 ficheros rastreados en las cinco).

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// ── correos personales ──────────────────────────────────────────────────────────
const EMAIL_DIRS = ["tests/", "scripts/", ".github/"];
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
const LITERAL_SKIP_FILE = (rel: string) =>
  basename(rel) === "package-lock.json" ||
  rel.includes("qa-snapshots") ||
  // La aprobación visual es, ENTERA, una lista de sha256 de PNG: ese es su contenido, no un
  // descuido. Un hash de una captura pública no es una credencial —no abre nada, y se puede
  // recalcular desde el artefacto—, así que la regla de «32+ alfanuméricos» no dice nada útil
  // sobre este fichero. Se salta por ruta exacta y no por carpeta: `qa/` guarda también el
  // README y los inventarios, donde un literal largo sí merecería una pregunta.
  rel === "qa/visual-aprobado.json";
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

/**
 * Los ficheros que git conoce en `raiz`: lo rastreado y lo stageado, en rutas relativas.
 *
 * `git ls-files` lee el índice, que es exactamente la unión de las dos cosas — un `git add` de un
 * fichero nuevo lo mete ahí antes de que exista ningún commit. `-z` porque hay rutas con espacios
 * («Compound Ascend v1» no, que es la raíz, pero sí alguna dentro) y partir por `\n` las rompería.
 */
function ficherosDeGit(raiz: string): string[] {
  const salida = execFileSync("git", ["-C", raiz, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return salida.split("\0").filter(Boolean);
}

/** De esos, los que vale la pena abrir: extensión de texto conocida. */
function escaneables(raiz: string): string[] {
  return ficherosDeGit(raiz).filter((rel) => SCAN_EXT.has(extname(rel)));
}

/**
 * El contenido se lee del árbol de trabajo, no del blob del índice.
 *
 * Es lo que va a entrar en el commit siguiente, y evita un `git show :ruta` por fichero (1519
 * subprocesos). Un fichero stageado y luego modificado se inspecciona en su versión de disco: la
 * más nueva, que es la que falta por revisar.
 *
 * `null` si no se puede leer: un fichero stageado y después borrado del disco sigue en el índice.
 */
function leer(raiz: string, rel: string): string | null {
  try {
    return readFileSync(join(raiz, rel), "utf8");
  } catch {
    return null;
  }
}

/** Correos de dominio real en las tres carpetas, fuera del allowlist. */
function correosFiltrados(raiz: string, ficheros: string[]): string[] {
  const hallazgos: string[] = [];
  for (const rel of ficheros) {
    if (!EMAIL_DIRS.some((d) => rel.startsWith(d))) continue;
    const texto = leer(raiz, rel);
    if (texto === null) continue;
    for (const m of texto.matchAll(REAL_EMAIL)) {
      if (!EMAIL_ALLOW.has(m[0].toLowerCase())) hallazgos.push(`${rel} → ${m[0]}`);
    }
  }
  return hallazgos;
}

/** Literales con forma de clave, fuera de lo permitido. */
function literalesSospechosos(raiz: string, ficheros: string[]): string[] {
  const hallazgos: string[] = [];
  for (const rel of ficheros) {
    if (LITERAL_SKIP_FILE(rel)) continue;
    const texto = leer(raiz, rel);
    if (texto === null) continue;
    for (const m of texto.matchAll(LONG_LITERAL)) {
      if (!LITERAL_ALLOW.has(m[1]!)) hallazgos.push(`${rel} → ${m[1]!.slice(0, 48)}`);
    }
  }
  return hallazgos;
}

describe("higiene · correos de dominio real filtrados", () => {
  it("no hay correos personales en tests/, scripts/ ni .github/", () => {
    const hallazgos = correosFiltrados(REPO_ROOT, escaneables(REPO_ROOT));
    expect(hallazgos, `correos de dominio real filtrados:\n${hallazgos.join("\n")}`).toEqual([]);
  });
});

describe("higiene · literales con forma de clave", () => {
  it("no hay literales de 32+ alfanuméricos fuera de las carpetas permitidas", () => {
    const hallazgos = literalesSospechosos(REPO_ROOT, escaneables(REPO_ROOT));
    expect(hallazgos, `literales con forma de clave:\n${hallazgos.join("\n")}`).toEqual([]);
  });
});

/**
 * Lo que la guarda mira, probado en un repo de verdad y de usar y tirar.
 *
 * En un repo temporal y no en este, a propósito: la diferencia que importa es «sin versionar» vs
 * «stageado», y comprobarla acá significaría hacer `git add` en el repo de Memo, que tiene trabajo
 * sin versionar suyo. Una guarda no puede pedir que se toque el índice de nadie para demostrarse.
 */
describe("la guarda mira el índice de git, no el disco", () => {
  const CLAVE = "Z".repeat(40);
  /** Un literal con forma de clave, en un fichero que la guarda sabe abrir. */
  const CONTENIDO = `export const token = "${CLAVE}";\n`;
  /**
   * El correo de prueba se ARMA, no se escribe.
   *
   * Escrito tal cual, este fichero —que vive en `tests/`— contendría un correo de dominio real y la
   * guarda se señalaría a sí misma; pasó en la primera corrida, con dos hallazgos que eran su
   * propio fixture. Meterlo en el allowlist sería peor: lo permitiría en todo el repo. Partido en
   * dos trozos, el fichero de verdad no contiene ninguna dirección, que es lo que la regla pide.
   */
  const CORREO = ["alguien", "gmail.com"].join("@");

  function repoDePrueba(): string {
    const raiz = mkdtempSync(join(tmpdir(), "higiene-"));
    execFileSync("git", ["-C", raiz, "init", "-q"]);
    // Sin identidad configurada `git` falla al commitear; acá no se commitea, pero se deja puesta
    // para que el repo sea usable si algún día este test necesita un commit.
    execFileSync("git", ["-C", raiz, "config", "user.email", "prueba@ci.local"]);
    execFileSync("git", ["-C", raiz, "config", "user.name", "prueba"]);
    return raiz;
  }

  it("un fichero SIN VERSIONAR con un literal largo no se señala", () => {
    const raiz = repoDePrueba();
    try {
      writeFileSync(join(raiz, "suelto.ts"), CONTENIDO);

      expect(ficherosDeGit(raiz), "el índice no debería saber de él").toEqual([]);
      expect(
        literalesSospechosos(raiz, escaneables(raiz)),
        "señaló un fichero que no va a entrar al repo",
      ).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("el mismo fichero, STAGEADO, sí se señala", () => {
    const raiz = repoDePrueba();
    try {
      writeFileSync(join(raiz, "suelto.ts"), CONTENIDO);
      execFileSync("git", ["-C", raiz, "add", "suelto.ts"]);

      expect(ficherosDeGit(raiz)).toEqual(["suelto.ts"]);
      const hallazgos = literalesSospechosos(raiz, escaneables(raiz));
      expect(hallazgos, "un `git add` es el último momento para cazarlo").toHaveLength(1);
      expect(hallazgos[0]).toContain("suelto.ts");
      expect(hallazgos[0]).toContain(CLAVE);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("una carpeta entera sin versionar no se mira, aunque esté llena", () => {
    // El caso real: `.claude/worktrees/**` y los Pods de iOS. Antes bastaban para poner la suite
    // roja en local; ahora no hace falta ninguna lista de carpetas a saltar.
    const raiz = repoDePrueba();
    try {
      mkdirSync(join(raiz, "node_modules", "paquete"), { recursive: true });
      writeFileSync(join(raiz, "node_modules", "paquete", "indice.js"), CONTENIDO);
      mkdirSync(join(raiz, ".claude", "worktrees", "otra-sesion"), { recursive: true });
      writeFileSync(join(raiz, ".claude", "worktrees", "otra-sesion", "a.ts"), CONTENIDO);

      expect(literalesSospechosos(raiz, escaneables(raiz))).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("un correo personal stageado en tests/ se señala, y fuera de las tres carpetas no", () => {
    const raiz = repoDePrueba();
    try {
      mkdirSync(join(raiz, "tests"), { recursive: true });
      mkdirSync(join(raiz, "src"), { recursive: true });
      writeFileSync(join(raiz, "tests", "a.ts"), `const u = "${CORREO}";\n`);
      writeFileSync(join(raiz, "src", "b.ts"), `const u = "${CORREO}";\n`);
      execFileSync("git", ["-C", raiz, "add", "tests/a.ts", "src/b.ts"]);

      const hallazgos = correosFiltrados(raiz, escaneables(raiz));
      expect(hallazgos).toHaveLength(1);
      expect(hallazgos[0]).toContain("tests/a.ts");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("el allowlist del buzón demo sigue valiendo", () => {
    const raiz = repoDePrueba();
    try {
      mkdirSync(join(raiz, "scripts"), { recursive: true });
      writeFileSync(
        join(raiz, "scripts", "seed.ts"),
        'const demo = "information.theglowup@gmail.com";\n',
      );
      execFileSync("git", ["-C", raiz, "add", "scripts/seed.ts"]);

      expect(correosFiltrados(raiz, escaneables(raiz))).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
