/**
 * La microacción del ritual tiene que corresponder a lo que DISPARÓ la bandera.
 *
 * `alta_tasa_baja_proteccion` se enciende con `tasaInversion ≥ 0,15 && protectionScore < 50`, y
 * ese puntaje son cinco casillas: tres seguros (gastos mayores, vida, invalidez) y los dos fondos
 * de defensa. La microacción, en cambio, decía siempre «revisa si tu fondo de emergencia cubre al
 * menos 3 meses».
 *
 * En la cuenta de demo eso es literalmente un consejo sobre lo único que esa persona SÍ tiene: el
 * fondo de emergencia está cubierto (₡1.520.000 sobre un objetivo de USD 1.000) y lo que falta
 * son las TRES pólizas, que no tiene ninguna. La tarjeta mandaba a mirar donde no estaba el
 * problema.
 */
import { describe, it, expect } from "vitest";

import { accionDeProteccion } from "@/modules/wealth/engine/daily-insight";

const seguro = (type: string) => ({
  type,
  severity: "alto" as const,
  description: "",
  recommendation: "",
});

describe("accionDeProteccion", () => {
  it("si faltan seguros, manda a los seguros — y nombra uno", () => {
    const a = accionDeProteccion([seguro("Seguro de vida"), seguro("Seguro de invalidez")]);
    expect(a).toMatch(/seguro/i);
    expect(a).toContain("vida");
    expect(a).not.toMatch(/fondo de emergencia/i);
  });

  it("si solo faltan los fondos, manda al fondo", () => {
    const a = accionDeProteccion([seguro("Fondo de emergencia")]);
    expect(a).toMatch(/fondo/i);
    expect(a).not.toMatch(/seguro/i);
  });

  it("con las dos cosas, primero los seguros: un fondo no cubre una hospitalización", () => {
    const a = accionDeProteccion([seguro("Fondo de paz"), seguro("Seguro de gastos mayores")]);
    expect(a).toMatch(/seguro/i);
  });

  it("«gastos médicos menores» no cuenta: es opcional y no puntúa", () => {
    // Está en `gaps` con severidad baja justamente porque NO afecta el puntaje. Si contara,
    // la tarjeta mandaría a comprar un seguro por una casilla que no disparó nada.
    const a = accionDeProteccion([
      {
        type: "Gastos médicos menores (opcional)",
        severity: "bajo",
        description: "",
        recommendation: "",
      },
      seguro("Fondo de emergencia"),
    ]);
    expect(a).toMatch(/fondo/i);
    expect(a).not.toMatch(/seguro/i);
  });

  it("sin brechas legibles, no inventa: manda a la pantalla de protección", () => {
    expect(accionDeProteccion([])).toMatch(/protección/i);
  });

  it("habla de vos, como el resto de lo que se escribió después", () => {
    for (const gaps of [[seguro("Seguro de vida")], [seguro("Fondo de paz")], []]) {
      expect(accionDeProteccion(gaps)).not.toMatch(/\brevisa\b|\btu fondo cubre\b/);
    }
  });
});
