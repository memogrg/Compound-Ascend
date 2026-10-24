/**
 * El modelo v2 visto desde `/m`. Lo que se fija acá es que la app móvil NO se desincronice
 * del modelo: si mañana alguien mueve una pestaña y `/m` deja de ofrecerla, esto lo dice.
 */
import { describe, it, expect } from "vitest";

import {
  eyebrowDeRuta,
  eyebrowRepiteTitulo,
  gruposDrawerV2,
  pestanasMovilDe,
} from "@/app/(mobile)/m/lib/nav-v2-movil";
import { NUCLEOS } from "@/lib/constants/nav-v2";

const grupos = gruposDrawerV2();

describe("grupos del drawer", () => {
  it("son los 5 núcleos en su orden, más Configuración", () => {
    expect(grupos.map((g) => g.label)).toEqual([...NUCLEOS.map((n) => n.name), "Configuración"]);
  });

  it("cada grupo lleva el icono de su núcleo", () => {
    for (const n of NUCLEOS) {
      expect(grupos.find((g) => g.id === n.id)?.icon, n.id).toBe(n.icon);
    }
    expect(grupos.find((g) => g.id === "configuracion")?.icon).toBe("gear");
  });

  it("ninguna ruta es nula y todas son de /m", () => {
    for (const g of grupos) {
      for (const it of g.items) {
        expect(it.hrefM, `${g.id}/${it.id}`).toBeTruthy();
        expect(it.hrefM === "/m" || it.hrefM.startsWith("/m/"), it.hrefM).toBe(true);
      }
    }
  });

  it("no ofrece `suscripcion`: su camino acaba en Stripe (Apple 3.1.1)", () => {
    const ids = grupos.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).not.toContain("suscripcion");
  });

  it("no ofrece pantallas que no existen (`nueva` / `futura`)", () => {
    const ids = grupos.flatMap((g) => g.items.map((i) => i.id));
    // `recurrentes` es `nueva` (sin ruta) y `libertad` es `futura` (con hrefM, pero la
    // pantalla no cuenta como destino del modelo todavía).
    expect(ids).not.toContain("recurrentes");
    expect(ids).not.toContain("libertad");
  });

  it("no repite destinos", () => {
    const rutas = grupos.flatMap((g) => g.items.map((i) => i.hrefM));
    const repetidas = rutas.filter((r, i) => rutas.indexOf(r) !== i);
    expect(repetidas, "rutas ofrecidas más de una vez").toEqual([]);
  });

  it("no hay grupos vacíos", () => {
    expect(grupos.filter((g) => g.items.length === 0)).toEqual([]);
  });
});

describe("eyebrowDeRuta", () => {
  it("da el nombre del núcleo de la ruta móvil", () => {
    expect(eyebrowDeRuta("/m/patrimonio")).toBe("Patrimonio");
    expect(eyebrowDeRuta("/m/deudas")).toBe("Planes");
    expect(eyebrowDeRuta("/m")).toBe("Hoy");
    expect(eyebrowDeRuta("/m/gastos")).toBe("Flujo");
    expect(eyebrowDeRuta("/m/asistente")).toBe("Asesor");
  });

  it("es null donde no hay núcleo: Configuración existe en la tabla pero no cuelga de uno", () => {
    expect(eyebrowDeRuta("/m/perfil")).toBeNull();
    expect(eyebrowDeRuta("/m/configurar")).toBeNull();
  });

  it("es null para una ruta que no está en el modelo", () => {
    expect(eyebrowDeRuta("/m/inventada")).toBeNull();
    expect(eyebrowDeRuta("/m/sin-plan")).toBeNull();
  });

  it("ignora query y hash", () => {
    expect(eyebrowDeRuta("/m/gastos?x=1")).toBe("Flujo");
    expect(eyebrowDeRuta("/m/proteccion#fondos")).toBe("Patrimonio");
  });
});

describe("pestanasMovilDe", () => {
  it("devuelve las hermanas del núcleo, con la activa marcada", () => {
    const r = pestanasMovilDe("/m/deudas");
    expect(r.map((p) => p.hrefM)).toEqual(["/m/metas", "/m/deudas", "/m/proteccion#fondos"]);
    expect(r.filter((p) => p.activa).map((p) => p.id)).toEqual(["deudas"]);
  });

  it("con menos de dos hermanas devuelve [] — una pestaña sola no es una barra", () => {
    // Asesor tiene una sola pantalla.
    expect(pestanasMovilDe("/m/asistente")).toEqual([]);
  });

  it("marca exactamente una activa en cada ruta del modelo", () => {
    for (const g of grupos) {
      for (const it of g.items) {
        const r = pestanasMovilDe(it.hrefM.split("?")[0]!, it.hrefM.split("?")[1] ?? null);
        if (r.length === 0) continue; // núcleo de una sola pestaña, o Configuración
        expect(r.filter((p) => p.activa).length, it.hrefM).toBe(1);
      }
    }
  });

  it("el `?tab=` desempata dentro del mismo pathname", () => {
    const sinTab = pestanasMovilDe("/m/mis-acciones");
    const conTab = pestanasMovilDe("/m/mis-acciones", "tab=progreso");
    expect(sinTab.find((p) => p.activa)?.id).toBe("acciones");
    expect(conTab.find((p) => p.activa)?.id).toBe("progreso");
  });

  it("es [] para una ruta fuera del modelo", () => {
    expect(pestanasMovilDe("/m/inventada")).toEqual([]);
  });

  it("Configuración no tiene pestañas de núcleo", () => {
    expect(pestanasMovilDe("/m/perfil")).toEqual([]);
  });
});

describe("eyebrowRepiteTitulo", () => {
  it("es true cuando dicen lo mismo, aunque cambien tildes y mayúsculas", () => {
    // El caso real: en Patrimonio el núcleo y la pantalla se llaman igual, y el eyebrow
    // se pinta en versalitas, así que sobre el papel «PATRIMONIO» y «Patrimonio» difieren.
    expect(eyebrowRepiteTitulo("Patrimonio", "PATRIMONIO")).toBe(true);
    expect(eyebrowRepiteTitulo("Patrimonio", "Patrimonio")).toBe(true);
    expect(eyebrowRepiteTitulo("Proteccion", "Protección")).toBe(true);
    expect(eyebrowRepiteTitulo("  Patrimonio  ", "Patrimonio")).toBe(true);
  });

  it("es false cuando aportan jerarquía de verdad", () => {
    expect(eyebrowRepiteTitulo("Planes", "Deudas y Préstamos")).toBe(false);
    expect(eyebrowRepiteTitulo("Flujo", "Gastos")).toBe(false);
    // Contener al otro no es repetirlo: «Patrimonio» sobre «Patrimonio neto» sí orienta.
    expect(eyebrowRepiteTitulo("Patrimonio", "Patrimonio neto")).toBe(false);
  });

  it("sin alguno de los dos no hay nada que comparar", () => {
    expect(eyebrowRepiteTitulo(null, "Patrimonio")).toBe(false);
    expect(eyebrowRepiteTitulo("Patrimonio", undefined)).toBe(false);
    expect(eyebrowRepiteTitulo("", "")).toBe(false);
  });
});
