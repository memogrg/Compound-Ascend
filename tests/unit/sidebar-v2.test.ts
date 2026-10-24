/**
 * El sidebar v2, por su parte pura (`sidebar-v2-items.ts`).
 *
 * NO es un test de render. El repo no tiene `@testing-library/react` ni entorno DOM en
 * vitest (`environment: "node"`), y el prompt prohíbe instalar nada, así que la decisión de
 * qué se pinta se sacó del JSX a `itemsDeSidebar()` y se prueba ahí. Lo que queda sin
 * cubrir por tests —clases CSS, `aria-*`, el botón de colapso— se verifica en las capturas
 * y en la auditoría axe con la bandera encendida.
 */
import { describe, it, expect } from "vitest";

import { itemsDeSidebar } from "@/components/layout/sidebar-v2-items";

describe("itemsDeSidebar · estructura", () => {
  it("son siempre los 5 núcleos, en orden, esté donde esté el usuario", () => {
    for (const ruta of ["/dashboard", "/gastos", "/deudas", "/dev/ui"]) {
      expect(itemsDeSidebar(ruta, null).map((i) => i.nucleo.name), ruta).toEqual([
        "Hoy",
        "Flujo",
        "Planes",
        "Patrimonio",
        "Asesor",
      ]);
    }
  });

  it("una ruta fuera del modelo no marca ningún núcleo ni abre pestañas", () => {
    const items = itemsDeSidebar("/dev/ui", null);
    expect(items.filter((i) => i.activo)).toEqual([]);
    expect(items.flatMap((i) => i.tabs)).toEqual([]);
  });
});

describe("itemsDeSidebar · activo", () => {
  it("/gastos marca Flujo, y dentro «Gastos y sobres»", () => {
    const items = itemsDeSidebar("/gastos", null);
    const activos = items.filter((i) => i.activo);
    expect(activos).toHaveLength(1);
    expect(activos[0]?.nucleo.name).toBe("Flujo");
    expect(activos[0]?.tabs.find((t) => t.activa)?.name).toBe("Gastos y sobres");
  });

  it("solo el núcleo activo muestra pestañas", () => {
    const items = itemsDeSidebar("/gastos", null);
    for (const i of items) {
      if (i.nucleo.id === "flujo") expect(i.tabs.length).toBeGreaterThan(0);
      else expect(i.tabs, i.nucleo.id).toEqual([]);
    }
  });

  it("?tab=progreso distingue Progreso de Acciones", () => {
    expect(
      itemsDeSidebar("/mis-acciones", "tab=progreso")[0]?.tabs.find((t) => t.activa)?.name,
    ).toBe("Progreso");
    expect(itemsDeSidebar("/mis-acciones", null)[0]?.tabs.find((t) => t.activa)?.name).toBe(
      "Acciones",
    );
  });

  it("/patrimonio/proteccion marca Patrimonio, no Planes (que también lleva a Fondos)", () => {
    const activo = itemsDeSidebar("/patrimonio/proteccion", null).find((i) => i.activo);
    expect(activo?.nucleo.name).toBe("Patrimonio");
    expect(activo?.tabs.find((t) => t.activa)?.name).toBe("Protección");
  });
});

describe("itemsDeSidebar · qué pestañas se pintan", () => {
  it("las que no tienen pantalla web quedan fuera: Recurrentes (nueva) y Libertad (futura)", () => {
    // Libertad tiene `hrefM` (/m/libertad existe) pero no `href`: un enlace sin destino en
    // web no se pinta.
    expect(itemsDeSidebar("/mi-base-financiera", null)[1]?.tabs.map((t) => t.name)).toEqual([
      "Resumen",
      "Ingresos",
      "Gastos y sobres",
      "Transacciones",
    ]);
    expect(itemsDeSidebar("/mi-rich-life", null)[3]?.tabs.map((t) => t.name)).toEqual([
      "Resumen",
      "Inversiones",
      "Protección",
      "Indicadores",
    ]);
  });

  it("Fondos SÍ se pinta aunque lleve #: es un destino, solo no resuelve por ruta", () => {
    const planes = itemsDeSidebar("/control-financiero", null)[2];
    expect(planes?.tabs.map((t) => t.name)).toEqual(["Metas", "Deudas", "Fondos"]);
    expect(planes?.tabs.find((t) => t.name === "Fondos")?.href).toBe(
      "/patrimonio/proteccion#fondos",
    );
    // …y nunca está activa, porque el pathname no lleva hash.
    expect(planes?.tabs.find((t) => t.name === "Fondos")?.activa).toBe(false);
  });

  it("toda pestaña pintada tiene href (el tipo lo permite null)", () => {
    for (const ruta of ["/dashboard", "/gastos", "/deudas", "/mi-rich-life", "/asistente"]) {
      for (const t of itemsDeSidebar(ruta, null).flatMap((i) => i.tabs)) {
        expect(typeof t.href, `${ruta} → ${t.id}`).toBe("string");
      }
    }
  });
});

describe("itemsDeSidebar · contadores", () => {
  it("sin badges, ningún núcleo muestra contador", () => {
    expect(itemsDeSidebar("/dashboard", null).every((i) => i.badge === null)).toBe(true);
  });

  it("el contador llega al núcleo por su badgeKey", () => {
    const items = itemsDeSidebar("/dashboard", null, {
      acciones: 3,
      porRevisar: 2,
      metasRiesgo: 1,
    });
    expect(items.map((i) => i.badge)).toEqual([3, 2, 1, null, null]);
  });

  it("un 0 no pinta chip (0 pendientes no es una novedad)", () => {
    expect(itemsDeSidebar("/dashboard", null, { acciones: 0 })[0]?.badge).toBeNull();
  });

  it("Patrimonio y Asesor no tienen badgeKey, así que nunca muestran contador", () => {
    const items = itemsDeSidebar("/dashboard", null, {
      acciones: 9,
      porRevisar: 9,
      metasRiesgo: 9,
    });
    expect(items[3]?.badge).toBeNull();
    expect(items[4]?.badge).toBeNull();
  });
});
