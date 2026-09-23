/**
 * Las primitivas de KPI: las funciones puras y el contrato que las hace utilizables.
 *
 * El test que manda es el PRIMERO: el hero anima el número con `Intl` (dentro de
 * NumberFlow) mientras el resto de la app lo escribe con `format.ts`, que es determinista y
 * no usa `Intl`. Si esos dos caminos divergen un solo carácter, la pantalla se contradice
 * consigo misma. Acá se comparan carácter a carácter, incluidos el 0, un negativo y un
 * valor que redondea a cero.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { formatMoney } from "@/lib/format";
import {
  describirDelta,
  pathSparkline,
  severidadMeter,
  partesNumero,
  textoNumero,
  KpiHero,
  KpiCard,
  Meter,
} from "@/components/kpi";

describe("NumberFlow escribe lo mismo que formatMoney", () => {
  const CASOS = [0, 1234567, -890000, 1500.5, 34145739];

  it.each(CASOS)("%d coincide carácter a carácter", (valor) => {
    expect(textoNumero(partesNumero(valor, "CRC"))).toBe(formatMoney(valor, "CRC"));
  });

  it("−0,4 con 0 decimales es «₡0», no «−₡0»", () => {
    // El signo se decide DESPUÉS de redondear. Si no, el hero mostraría un menos delante de
    // un cero, que es un número que no existe.
    expect(textoNumero(partesNumero(-0.4, "CRC"))).toBe(formatMoney(-0.4, "CRC"));
    expect(textoNumero(partesNumero(-0.4, "CRC"))).not.toContain("−");
  });

  it("también con decimales y otra moneda", () => {
    expect(textoNumero(partesNumero(1234.5, "USD", 2))).toBe(formatMoney(1234.5, "USD", 2));
  });

  it("el menos es el tipográfico (U+2212), no un guion", () => {
    const t = textoNumero(partesNumero(-1, "CRC"));
    expect(t.charCodeAt(0)).toBe(0x2212);
  });

  it("el valor que recibe NumberFlow nunca es negativo", () => {
    // El signo viaja en el prefijo: si se lo pasáramos negativo a NumberFlow, pondría el
    // guion de `Intl` y perderíamos el carácter correcto.
    expect(partesNumero(-890000, "CRC").valor).toBe(890000);
  });
});

describe("describirDelta", () => {
  it("en una métrica donde subir es bueno, subir es bueno", () => {
    const d = describirDelta(43000, "CRC", "arriba");
    expect(d.tono).toBe("bueno");
    expect(d.flecha).toBe("↑");
    expect(d.lectura).toBe("sube");
    expect(d.texto).toBe(`+${formatMoney(43000, "CRC")}`);
  });

  it("en una métrica donde subir es malo, el MISMO signo es malo", () => {
    // Es el caso que justifica la función: en Gastos un «+» no se pinta de verde.
    expect(describirDelta(43000, "CRC", "abajo").tono).toBe("malo");
    expect(describirDelta(-43000, "CRC", "abajo").tono).toBe("bueno");
  });

  it("bajar lleva el menos tipográfico, no un guion", () => {
    expect(describirDelta(-200000, "CRC", "arriba").texto.charCodeAt(0)).toBe(0x2212);
  });

  it("el cero no es ni bueno ni malo y no lleva signo", () => {
    const d = describirDelta(0, "CRC", "arriba");
    expect(d).toMatchObject({ texto: "sin cambio", tono: "neutro", direccion: 0, flecha: "→" });
  });

  it("un valor que redondea a cero también es «sin cambio»", () => {
    expect(describirDelta(0.4, "CRC", "arriba").texto).toBe("sin cambio");
  });

  it("un valor no finito no rompe el chip", () => {
    expect(describirDelta(Number.NaN, "CRC", "arriba").tono).toBe("neutro");
  });

  it("siempre hay una lectura para quien no ve el color", () => {
    for (const v of [5, -5, 0]) {
      expect(describirDelta(v, "CRC", "arriba").lectura.length).toBeGreaterThan(0);
    }
  });
});

describe("pathSparkline", () => {
  it("12 puntos producen 12 comandos", () => {
    const d = pathSparkline([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 72, 24);
    expect(d.startsWith("M")).toBe(true);
    expect(d.split("L")).toHaveLength(12);
  });

  it("el primer punto está en x=0 y el último en x=ancho", () => {
    const d = pathSparkline([1, 2, 3], 60, 20);
    expect(d).toContain("M0.0 ");
    expect(d.split(" ").at(-2)).toBe("L60.0");
  });

  it("una serie plana se dibuja a media altura en vez de dar NaN", () => {
    // max − min = 0: la normalización dividiría por cero y toda la línea saldría `NaN`,
    // que en un `<path>` no se ve como error: simplemente no se pinta nada.
    const d = pathSparkline([5, 5, 5], 60, 20);
    expect(d).not.toContain("NaN");
    expect(d).toBe("M0.0 10.0 L30.0 10.0 L60.0 10.0");
  });

  it("sin puntos no hay path", () => {
    expect(pathSparkline([], 60, 20)).toBe("");
  });

  it("un solo punto no dibuja línea", () => {
    expect(pathSparkline([7], 60, 20)).toBe("M30.0 10.0");
  });

  it("los valores no finitos se descartan, no contaminan la escala", () => {
    const d = pathSparkline([1, Number.NaN, 3], 60, 20);
    expect(d).not.toContain("NaN");
    expect(d.split("L")).toHaveLength(2);
  });

  it("el valor más alto queda arriba", () => {
    // Y crece hacia abajo en SVG: el máximo debe tener la Y más pequeña.
    const d = pathSparkline([0, 10], 60, 20);
    const ys = d
      .split(" ")
      .filter((_, i) => i % 2 === 1)
      .map(Number);
    expect(ys[1]!).toBeLessThan(ys[0]!);
  });
});

describe("severidadMeter", () => {
  it("por debajo del aviso, todo bien", () => {
    expect(severidadMeter(50, { aviso: 80, peligro: 100 })).toBe("ok");
  });

  it("el umbral es inclusivo: el 80 exacto YA avisa", () => {
    // Quien fija el aviso en 80 quiere enterarse AL llegar, no al pasarse.
    expect(severidadMeter(80, { aviso: 80, peligro: 100 })).toBe("aviso");
    expect(severidadMeter(79.9, { aviso: 80, peligro: 100 })).toBe("ok");
  });

  it("peligro manda sobre aviso", () => {
    expect(severidadMeter(120, { aviso: 80, peligro: 100 })).toBe("peligro");
  });

  it("un valor no finito no pinta alarma", () => {
    expect(severidadMeter(Number.NaN, { aviso: 80, peligro: 100 })).toBe("ok");
  });
});

describe("render en servidor", () => {
  it("el hero escribe el número entero en texto, no solo en dígitos animados", () => {
    // NumberFlow parte el número en un `<span>` por dígito: un lector de pantalla leería
    // «uno, punto, dos». La cifra completa tiene que existir como texto en el DOM.
    const html = renderToStaticMarkup(<KpiHero etiqueta="Libre para gastar" valor={1234567} />);
    expect(html).toContain(formatMoney(1234567, "CRC"));
    expect(html).toContain("Libre para gastar");
  });

  it("el hero no explota en servidor con un valor negativo ni con cero", () => {
    for (const v of [0, -890000]) {
      const html = renderToStaticMarkup(<KpiHero etiqueta="Saldo" valor={v} />);
      expect(html).toContain(formatMoney(v, "CRC"));
    }
  });

  it("la tarjeta escribe la cifra con formatMoney, sin animar", () => {
    const html = renderToStaticMarkup(<KpiCard etiqueta="Ingresos" valor={2500000} />);
    expect(html).toContain(formatMoney(2500000, "CRC"));
    expect(html).not.toContain("number-flow");
  });

  it("el meter sale con su rol y sus tres valores", () => {
    const html = renderToStaticMarkup(<Meter valor={43} etiqueta="Presupuesto usado" />);
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="43"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-label="Presupuesto usado"');
  });

  it("el meter acota el valor al rango en vez de desbordar la barra", () => {
    const html = renderToStaticMarkup(<Meter valor={180} etiqueta="Presupuesto usado" />);
    expect(html).toContain("width:100%");
    expect(html).toContain('aria-valuenow="100"');
  });
});
