/**
 * Los sobres DERIVADOS no pueden salir como «casi no lo usás».
 *
 * Con la cuenta de demo, la campana decía dos cosas falsas:
 *
 *   «Casi no usás Aporte — Fondo de emergencia · ₡200.000 al mes y en 3 meses usaste ₡0»
 *   «Casi no usás Otras deudas · ₡620.680 al mes y en 3 meses usaste ₡0»
 *
 * Y en esa misma ventana hay ₡400.000 de aportes reales al fondo y tres cuotas pagadas. El ₡0 no
 * es un dato: es que las dos mitades se cuentan con claves distintas. La línea derivada de una
 * meta nace SIN categoría, así que su clave es `name:aporte — fondo de emergencia`; el gasto real
 * se agrupa por `category_id`. Nunca coinciden, así que el sobre marca 100 % sin usar por
 * construcción. Con las deudas pasa lo mismo por otro camino: la línea va a la categoría de
 * sistema «Otras deudas» y los pagos están en «Hipoteca» y «Vehículo».
 *
 * Mientras esas claves no se arreglen —decisión de Memo, con su inventario aparte— un sobre
 * derivado no admite la pregunta «¿lo usás?»: no se gasta desde él, se genera desde su entidad.
 * Un sobre MANUAL subutilizado sí, y por eso está el caso espejo.
 *
 * Las cifras son las REALES de la demo, para que el caso se lea como lo que arregla.
 */
import { describe, it, expect } from "vitest";

import { detectarOciosos, type SobreHistorico } from "@/lib/rhythm/idle-envelopes";

/** Los tres sobres de la demo: dos derivados y uno manual, todos sin usar. */
const SOBRES: SobreHistorico[] = [
  {
    categoryId: "name:aporte — fondo de emergencia",
    path: "Aporte — Fondo de emergencia",
    frascoId: null,
    budgetMensual: 200_000,
    gastoVentana: 0,
    derivada: true,
  },
  {
    categoryId: "a7505a36-4a05-431f-b21e-5afc78b497f1",
    path: "Otras deudas",
    frascoId: "f2acd5c9-e2c1-422a-bbb4-d642390167ea",
    budgetMensual: 620_680,
    gastoVentana: 0,
    derivada: true,
  },
  {
    categoryId: "cat-formacion",
    path: "Crecimiento › Formación",
    frascoId: "frasco-crecimiento",
    budgetMensual: 85_000,
    gastoVentana: 5_000,
    derivada: false,
  },
  // Un sobre que SÍ se usa, para que haya receptor y las salidas no queden vacías.
  {
    categoryId: "cat-super",
    path: "Esencial › Supermercado",
    frascoId: "frasco-esencial",
    budgetMensual: 300_000,
    gastoVentana: 960_000,
    derivada: false,
  },
];

const correr = (sobres: SobreHistorico[] = SOBRES) =>
  detectarOciosos({ sobres, mesesVentana: 3, currency: "CRC" }).map((o) => o.path);

describe("sobres ociosos · las líneas derivadas no cuentan", () => {
  it("las dos tarjetas falsas de la demo desaparecen", () => {
    const paths = correr();
    expect(paths).not.toContain("Aporte — Fondo de emergencia");
    expect(paths).not.toContain("Otras deudas");
  });

  it("y el sobre MANUAL subutilizado sigue apareciendo", () => {
    // Si no, el arreglo sería apagar el detector, no arreglarlo.
    expect(correr()).toContain("Crecimiento › Formación");
  });

  it("un derivado tampoco puede RECIBIR presupuesto de otro sobre", () => {
    // Mover presupuesto a una línea derivada no sirve: se regenera desde su entidad en el
    // siguiente sync y el movimiento se pierde sin avisar.
    const conDerivadoCorto = [
      ...SOBRES,
      {
        categoryId: "name:aporte — universidad de sofía",
        path: "Aporte — Universidad de Sofía",
        frascoId: "frasco-crecimiento",
        budgetMensual: 150_000,
        gastoVentana: 600_000, // se "pasa": sería el receptor ideal si no fuera derivado
        derivada: true,
      },
    ];
    const ociosos = detectarOciosos({ sobres: conDerivadoCorto, mesesVentana: 3, currency: "CRC" });
    const destinos = ociosos.flatMap((o) =>
      o.salidas.map((s) => ("hastaPath" in s ? s.hastaPath : "")),
    );
    expect(destinos).not.toContain("Aporte — Universidad de Sofía");
  });

  it("sin la marca, se comporta como antes (compatibilidad)", () => {
    // `derivada` es opcional: un llamador que aún no la pase no cambia de comportamiento.
    const sinMarca = SOBRES.map(({ derivada: _d, ...resto }) => resto);
    expect(correr(sinMarca)).toContain("Aporte — Fondo de emergencia");
  });
});
