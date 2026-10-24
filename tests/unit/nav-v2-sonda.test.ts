/**
 * La decisión de «¿está encendida NAV_V2?», probada sin navegador.
 *
 * Está aquí porque es lo que se equivocó tres veces, y las tres con el mismo síntoma engañoso: un
 * caso se auto-saltaba diciendo «NAV_V2 apagada» —mentira—, y el guardián de CI convertía esa
 * mentira en «la bandera no llegó al build», tumbando un job con sus 23 tests en verde. Un fallo
 * así cuesta un relanzamiento y media hora de leer el log equivocado; este fichero lo cuesta una
 * vez.
 */
import { describe, it, expect } from "vitest";

import { decidirNavV2 } from "../a11y/nav-v2";

describe("decidirNavV2", () => {
  it("cinco ítems en una barra: encendida", () => {
    expect(decidirNavV2({ barras: 1, items: 5 })).toEqual({ listo: true, v2: true });
  });

  it("seis ítems en una barra: apagada", () => {
    expect(decidirNavV2({ barras: 1, items: 6 })).toEqual({ listo: true, v2: false });
  });

  it("encendida TARDE: mientras monta no responde, y al terminar dice que sí", () => {
    // El caso que importa. Con `>= 5` la versión anterior respondía «apagada» a mitad de montaje.
    const montando = [
      { barras: 0, items: 0 },
      { barras: 1, items: 3 },
      { barras: 2, items: 10 },
    ];
    for (const m of montando) {
      const d = decidirNavV2(m);
      expect(d.listo, `no debería responder con ${JSON.stringify(m)}`).toBe(false);
      expect(d.listo === false && d.motivo.length, "y debería decir por qué").toBeGreaterThan(10);
    }
    expect(decidirNavV2({ barras: 1, items: 5 })).toEqual({ listo: true, v2: true });
  });

  it("dos barras no son una respuesta, y el motivo nombra la hidratación", () => {
    // Es la causa real de la última caída: el fallback de Suspense y el contenido resuelto
    // conviven, y `.bottom-nav .bn-item` llega a contar diez.
    const d = decidirNavV2({ barras: 2, items: 10 });
    expect(d.listo).toBe(false);
    expect(d.listo === false && d.motivo).toMatch(/2 barras/);
    expect(d.listo === false && d.motivo).toMatch(/Suspense|hidrat/i);
  });

  it("nunca encendida: responde que NO, con la barra completa de seis", () => {
    // El caso legítimo de bandera apagada sigue respondiendo, y rápido.
    expect(decidirNavV2({ barras: 1, items: 6 })).toEqual({ listo: true, v2: false });
  });

  it("una barra vacía o a medias no se confunde con «apagada»", () => {
    for (const items of [0, 1, 3, 4, 7, 10]) {
      const d = decidirNavV2({ barras: 1, items });
      expect(d.listo, `${items} ítems no es una barra completa`).toBe(false);
      expect(d.listo === false && d.motivo, `${items} ítems`).toMatch(/5 .*6|ítems/);
    }
  });
});
