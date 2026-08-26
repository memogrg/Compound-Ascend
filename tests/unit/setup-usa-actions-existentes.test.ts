/**
 * GUARDIA DEL PRINCIPIO RECTOR: el módulo `setup` no tiene estado paralelo ni
 * lógica de alta propia.
 *
 * Contrato que se protege, leyendo el código fuente del módulo:
 *  1. No hay Server Actions propias (`"use server"`) ni acceso a Supabase: cada
 *     escritura sale de un action que YA existe en otro módulo.
 *  2. Cada action importada existe de verdad y está exportada donde se dice — si
 *     alguien renombra `setEnvelopeBudgetAction`, este test lo dice antes que el
 *     runtime.
 *  3. No hay tabla propia: ninguna migración crea `setup_*`, así que el progreso
 *     no puede estar persistido en ningún lado.
 *
 * Es un test de código fuente a propósito: lo que se quiere impedir es que
 * alguien AGREGUE una vía de escritura nueva, y eso no se ve ejecutando el
 * componente — se ve en sus imports.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const MODULE_DIR = join(process.cwd(), "src", "modules", "setup");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const FILES = walk(MODULE_DIR).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
const SOURCES = new Map(FILES.map((f) => [f, readFileSync(f, "utf8")]));

function rel(f: string): string {
  return f.slice(MODULE_DIR.length + 1).replace(/\\/g, "/");
}

describe("el módulo setup no escribe por su cuenta", () => {
  it("no declara ninguna Server Action propia", () => {
    const conUseServer = [...SOURCES].filter(([, src]) => /^\s*["']use server["']/m.test(src));
    expect(conUseServer.map(([f]) => rel(f))).toEqual([]);
  });

  it("no importa ningún cliente de Supabase", () => {
    const conSupabase = [...SOURCES].filter(([, src]) => src.includes("@/lib/supabase/"));
    expect(conSupabase.map(([f]) => rel(f))).toEqual([]);
  });

  it("no ejecuta escrituras: sin insert/update/upsert/delete en todo el módulo", () => {
    const conEscritura = [...SOURCES].filter(([, src]) =>
      /\.(insert|upsert|update|delete)\(/.test(src),
    );
    expect(conEscritura.map(([f]) => rel(f))).toEqual([]);
  });

  it("no define tablas: ninguna migración crea objetos `setup_*`", () => {
    const migrations = join(process.cwd(), "supabase", "migrations");
    const culpables = readdirSync(migrations).filter((f) =>
      /\bsetup_[a-z_]+/i.test(readFileSync(join(migrations, f), "utf8")),
    );
    expect(culpables).toEqual([]);
  });
});

describe("cada alta usa un action que ya existe", () => {
  /** Imports del módulo hacia los `api/actions` de otros módulos. */
  const importados: { file: string; from: string; names: string[] }[] = [];
  for (const [file, src] of SOURCES) {
    const re = /import\s*\{([^}]+)\}\s*from\s*["'](@\/modules\/[^"']*actions)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const names = m[1]!
        .split(",")
        .map((n) => n.trim().split(/\s+as\s+/)[0]!.trim())
        .filter(Boolean);
      importados.push({ file: rel(file), from: m[2]!, names });
    }
  }

  it("los asistentes escriben SOLO por actions de otros módulos (y hay al menos uno por asistente)", () => {
    const porArchivo = new Set(importados.map((i) => i.file));
    for (const wizard of [
      "components/wizards/presupuesto-wizard.tsx",
      "components/wizards/control-wizard.tsx",
      "components/wizards/defensa-wizard.tsx",
      "components/wizards/crecimiento-wizard.tsx",
    ]) {
      expect(porArchivo.has(wizard), `${wizard} no importa ningún action existente`).toBe(true);
    }
  });

  it("todos los actions importados existen y están exportados en su módulo", () => {
    const faltantes: string[] = [];
    for (const imp of importados) {
      const target = join(process.cwd(), "src", `${imp.from.slice("@/".length)}.ts`);
      const src = readFileSync(target, "utf8");
      for (const name of imp.names) {
        if (name.startsWith("type ")) continue;
        if (!new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${name}\\b`).test(src)) {
          faltantes.push(`${imp.from} → ${name} (usado en ${imp.file})`);
        }
      }
    }
    expect(faltantes).toEqual([]);
  });

  it("el asistente de Presupuesto usa los mismos actions que las pantallas de Ingresos y Gastos", () => {
    const src = SOURCES.get(join(MODULE_DIR, "components", "wizards", "presupuesto-wizard.tsx"))!;
    // Alta de ingreso = la de /ingresos; sobres = los del tab de Gastos (fork
    // para las hojas del catálogo base, edición para las propias); montos = el
    // candado del presupuesto por sobre, con su ventana de configuración.
    for (const action of [
      "registerIncomeSourceAction",
      "addCategoryAction",
      "forkCategoryAction",
      "editCategoryAction",
      "setEnvelopeBudgetAction",
    ]) {
      expect(src, `falta ${action}`).toContain(action);
    }
  });

  it("una edición fuera de la ventana se confirma, nunca se bloquea", () => {
    // `setEnvelopeBudgetAction` devuelve `needsConfirmation` fuera de los días
    // 1-5. El asistente TIENE que reintentar con confirmación, no rendirse.
    const src = SOURCES.get(join(MODULE_DIR, "components", "wizards", "presupuesto-wizard.tsx"))!;
    expect(src).toContain("needsConfirmation");
    expect(src).toContain("confirmedOutsideWindow");
  });
});

describe("al reentrar, el asistente muestra y edita lo que YA existe", () => {
  const WIZARDS = [
    "presupuesto-wizard.tsx",
    "control-wizard.tsx",
    "defensa-wizard.tsx",
    "crecimiento-wizard.tsx",
  ];

  it("ningún asistente arranca vacío: todos parten del snapshot real", () => {
    for (const w of WIZARDS) {
      const src = SOURCES.get(join(MODULE_DIR, "components", "wizards", w))!;
      // El estado que se pinta viene por props del servidor, no de un borrador.
      expect(src, `${w} no recibe el snapshot`).toContain("snapshot: SetupSnapshot");
      expect(src, `${w} no muestra lo ya existente`).toMatch(/ExistingList|snapshot\.(goals|holdings|sobres|policies)/);
    }
  });

  it("cada asistente abre en el primer paso SIN resolver (no siempre en el 1)", () => {
    for (const w of WIZARDS) {
      const src = SOURCES.get(join(MODULE_DIR, "components", "wizards", w))!;
      expect(src, `${w} no calcula el paso de reentrada`).toContain("steps.findIndex((s) => !s.done)");
      expect(src).toContain("startIndex");
    }
  });

  it("un paso resuelto se marca con el estado real, no con un contador local", () => {
    // `done` sale SIEMPRE del motor de progreso: si viniera de un useState, el
    // wizard podría decir "listo" con la entidad borrada.
    for (const w of WIZARDS) {
      const src = SOURCES.get(join(MODULE_DIR, "components", "wizards", w))!;
      expect(src).toMatch(/done: status\[\d\]!\.done/);
      expect(src, `${w} guarda el progreso en estado local`).not.toMatch(/useState[^\n]*done/i);
    }
  });

  it("el motor del wizard no guarda progreso: `done` es una prop, no estado", () => {
    const src = SOURCES.get(join(MODULE_DIR, "components", "setup-wizard.tsx"))!;
    expect(src).toContain("steps.filter((s) => s.done).length");
    expect(src).not.toMatch(/useState<[^>]*>\(\s*(true|false)\s*\).*done/i);
  });

  it("salir nunca cuesta: el motor ofrece una salida en todos los pasos", () => {
    const src = SOURCES.get(join(MODULE_DIR, "components", "setup-wizard.tsx"))!;
    expect(src).toContain("exitLabel");
    expect(src).toContain('exitLabel = "Después"');
  });
});

describe("el snapshot solo lee, y lee por los servicios de siempre", () => {
  const src = readFileSync(join(MODULE_DIR, "services", "setup-state.ts"), "utf8");

  it("lee el presupuesto, los sobres, las deudas, las metas, los fondos y las posiciones", () => {
    for (const fn of [
      "getBudgetTotals",
      "listCategoryTree",
      "listDebts",
      "listGoals",
      "getDefenseFundsReport",
      "listPolicies",
      "listHoldings",
      "getDesiredMonthlyLifestyle",
    ]) {
      expect(src, `falta la lectura ${fn}`).toContain(fn);
    }
  });

  it("importa esas lecturas por el BARREL de cada módulo, no por archivos internos", () => {
    // Los imports internos del PROPIO módulo son legítimos; lo que no puede
    // pasar es entrar a `services/` o `engine/` de otro módulo por la ventana.
    const internos = [...src.matchAll(/from\s+["'](@\/modules\/[^"']+)["']/g)]
      .map((m) => m[1]!)
      .filter((p) => !p.startsWith("@/modules/setup/"))
      .filter((p) => p.split("/").length > 3);
    expect(internos).toEqual([]);
  });
});
