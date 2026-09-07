/**
 * COBERTURA DE REVALIDACIÓN MÓVIL (#752).
 *
 * `revalidatePath` invalida la ruta EXACTA que se le pasa, y el móvil vive en su
 * propio árbol (`/m/...`). Una acción que revalidaba `/deudas` dejaba `/m/deudas`
 * sirviendo el dato viejo: en el celular había que recargar a mano.
 *
 * Medido antes del arreglo: de 161 `revalidatePath` en `src/`, sólo 10 apuntaban
 * a una ruta móvil; `control` (47 llamadas) y `assistant` (24) no tocaban ninguna.
 *
 * Estos tests son la guardia: si alguien agrega una pantalla móvil sin entrada en
 * el espejo, o vuelve a llamar `revalidatePath` directo desde una action, falla.
 */
import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  ESPEJO_MOVIL,
  RUTAS_MOVILES_APP,
  espejoMovil,
  revalidarRuta,
} from "@/lib/revalidation/rutas-espejo";
import { revalidatePath } from "next/cache";

const RAIZ = process.cwd();

/** Todos los .ts bajo un directorio. */
function archivosTs(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivosTs(p, acc);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

describe("el espejo cubre todas las pantallas móviles", () => {
  it("cada ruta de /m/(app) es alcanzable desde alguna ruta web", () => {
    const alcanzables = new Set(Object.values(ESPEJO_MOVIL).flat());
    const huerfanas = RUTAS_MOVILES_APP.filter((r) => !alcanzables.has(r));
    // Si esto falla: agregaste una pantalla móvil y ninguna acción la repinta.
    // La arregla una fila en ESPEJO_MOVIL, no un revalidatePath suelto.
    expect(huerfanas).toEqual([]);
  });

  it("RUTAS_MOVILES_APP refleja las rutas que existen de verdad", () => {
    const dir = join(RAIZ, "src", "app", "(mobile)", "m", "(app)");
    const reales = archivosTs(dir)
      .filter((p) => p.endsWith("page.tsx"))
      .map((p) =>
        p
          .slice(dir.length)
          .replace(/[\\/]page\.tsx$/, "")
          .replace(/\\/g, "/"),
      )
      // Las rutas con segmento dinámico no se revalidan por nombre.
      .filter((r) => !r.includes("["))
      .map((r) => `/m${r}`);
    for (const r of reales) expect(RUTAS_MOVILES_APP).toContain(r);
  });
});

describe("ninguna server action llama revalidatePath directo", () => {
  it("todas pasan por revalidarRuta (si no, el móvil se queda viejo)", () => {
    const infractores: string[] = [];
    for (const f of archivosTs(join(RAIZ, "src"))) {
      const src = readFileSync(f, "utf8");
      if (!src.includes('"use server"')) continue;
      // El propio módulo del espejo es el único que puede llamarlo.
      if (f.includes("rutas-espejo")) continue;
      if (/\brevalidatePath\s*\(/.test(src)) {
        infractores.push(f.slice(RAIZ.length + 1).replace(/\\/g, "/"));
      }
    }
    expect(infractores).toEqual([]);
  });
});

describe("revalidarRuta", () => {
  it("revalida la web Y sus gemelas móviles", () => {
    vi.mocked(revalidatePath).mockClear();
    revalidarRuta("/deudas");
    const llamadas = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(llamadas).toContain("/deudas");
    expect(llamadas).toContain("/m/deudas");
  });

  it("una ruta dinámica repinta la lista de su raíz", () => {
    // El móvil no tiene pantalla de detalle de deuda.
    expect(espejoMovil("/deudas/abc-123")).toContain("/m/deudas");
  });

  it("una ruta móvil no se espeja a sí misma (no hay recursión)", () => {
    expect(espejoMovil("/m/deudas")).toEqual([]);
  });

  it("una ruta desconocida no rompe: revalida sólo la web", () => {
    vi.mocked(revalidatePath).mockClear();
    revalidarRuta("/ruta-que-no-existe");
    expect(vi.mocked(revalidatePath).mock.calls.map((c) => c[0])).toEqual(["/ruta-que-no-existe"]);
  });

  it("el panel web repinta el inicio móvil y su hub de configuración", () => {
    expect(espejoMovil("/dashboard")).toEqual(expect.arrayContaining(["/m", "/m/configurar"]));
  });

  it("patrimonio repinta las cuatro pantallas móviles que lo muestran", () => {
    expect(espejoMovil("/patrimonio")).toEqual(
      expect.arrayContaining(["/m/patrimonio", "/m/inversiones", "/m/indicadores", "/m/libertad"]),
    );
  });
});
