/**
 * El motor de acciones es compartido con la web y devuelve rutas de ESCRITORIO.
 * Si una de ésas se cuela en un href de la app nativa, el WebView sale del shell
 * y el middleware puede mandarlo a /empezar (Stripe) — cobro fuera de la App
 * Store, guía 3.1.1. Este test es la red: ninguna ruta web puede sobrevivir.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { aRutaMobile, RUTA_WEB_A_MOBILE } from "@/app/(mobile)/m/lib/rutas-web-a-mobile";

describe("aRutaMobile", () => {
  it("traduce cada ruta conocida a su pantalla móvil", () => {
    for (const [web, movil] of Object.entries(RUTA_WEB_A_MOBILE)) {
      expect(aRutaMobile(web)).toBe(movil);
    }
  });

  it("los dos «patrimonio» no son el mismo lugar", () => {
    // /patrimonio (web) es el PORTAFOLIO; el patrimonio neto es /mi-rich-life.
    expect(aRutaMobile("/patrimonio")).toBe("/m/inversiones");
    expect(aRutaMobile("/mi-rich-life")).toBe("/m/patrimonio");
  });

  it("conserva el query string", () => {
    expect(aRutaMobile("/deudas?new=debt")).toBe("/m/deudas?new=debt");
    expect(aRutaMobile("/patrimonio?new=holding")).toBe("/m/inversiones?new=holding");
  });

  it("conserva el hash, y el hash junto al query", () => {
    expect(aRutaMobile("/gastos#sobres")).toBe("/m/gastos#sobres");
    expect(aRutaMobile("/gastos?mes=9#sobres")).toBe("/m/gastos?mes=9#sobres");
  });

  it("una ruta desconocida cae a /m, nunca a la ruta web", () => {
    expect(aRutaMobile("/reportes")).toBe("/m");
    expect(aRutaMobile("/empezar")).toBe("/m");
    expect(aRutaMobile("/suscripcion?plan=pro")).toBe("/m");
  });

  it("no toca una ruta que ya es de móvil", () => {
    expect(aRutaMobile("/m")).toBe("/m");
    expect(aRutaMobile("/m/metas")).toBe("/m/metas");
    expect(aRutaMobile("/m/inversiones?new=holding")).toBe("/m/inversiones?new=holding");
  });

  it("/mi-base-financiera no se confunde con /m (prefijo parecido)", () => {
    expect(aRutaMobile("/mi-base-financiera")).toBe("/m/mi-base-financiera");
  });

  it("tolera la barra final", () => {
    expect(aRutaMobile("/deudas/")).toBe("/m/deudas");
  });

  it("TODO destino del mapa es una ruta de la app móvil", () => {
    for (const destino of Object.values(RUTA_WEB_A_MOBILE)) {
      expect(destino === "/m" || destino.startsWith("/m/")).toBe(true);
    }
  });
});

/**
 * La guarda que importa a futuro: si alguien agrega una ruta nueva al motor y no la
 * mapea acá, la acción llevaría a `/m` en vez de a su pantalla — un fallo MUDO, porque
 * el fallback es seguro y nadie ve un error. Esto lo convierte en un test rojo.
 *
 * Se leen los fuentes en vez de importarlos: las rutas viven en literales dentro de
 * tablas que no se exportan.
 */
describe("cobertura contra el motor de acciones", () => {
  const FUENTES = [
    "../../src/modules/actions/engine/action-engine.ts",
    "../../src/lib/insights/actions.ts",
  ];

  const rutas = new Set<string>();
  for (const rel of FUENTES) {
    const sql = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    for (const m of sql.matchAll(/route:\s*"([^"]+)"/g)) rutas.add(m[1]!);
  }

  it("se encontraron rutas en los fuentes (si no, el regex dejó de servir)", () => {
    expect(rutas.size).toBeGreaterThan(5);
  });

  it("toda ruta que el motor puede emitir tiene pantalla móvil", () => {
    const sinMapear = [...rutas].filter((r) => !(r in RUTA_WEB_A_MOBILE)).sort();
    expect(sinMapear).toEqual([]);
  });
});
