/**
 * LA REGLA: una barra de plata nunca muestra un monto y después lo quita sin
 * explicación.
 *
 * El bug que originó esto: con `useOptimistic` el valor se soltaba al cerrar la
 * transición, y `router.refresh()` no es esperable — la transición cerraba ANTES
 * de que llegaran las props frescas. La barra se llenaba y se vaciaba sola. La
 * escritura andaba bien (verificado en la BD: los movimientos quedaban
 * guardados), pero el usuario veía desaparecer su plata.
 *
 * La reconciliación de acá NO usa tiempo: el anticipo se sostiene hasta que el
 * servidor REFLEJE el monto.
 */
import { describe, it, expect } from "vitest";
import {
  anticipar,
  cancelar,
  reconciliar,
  valorBarra,
  type PendientesBarra,
} from "@/lib/ui/barra-anticipada";

const VACIO: PendientesBarra = {};

describe("el anticipo NO se suelta hasta que el servidor confirme", () => {
  it("recién anticipado: la barra muestra el monto nuevo", () => {
    const servidor = { a: 1000 };
    const p = anticipar(VACIO, "a", 1000, 500);
    expect(valorBarra(servidor, p, "a")).toBe(1500);
  });

  it("props viejas (el servidor todavía no refleja): SE SOSTIENE", () => {
    // Éste es exactamente el instante del bug: la transición cerró, llegaron
    // props que aún dicen 1000, y la barra no puede volver a 1000.
    const servidor = { a: 1000 };
    let p = anticipar(VACIO, "a", 1000, 500);
    p = reconciliar(p, servidor);
    expect(p.a).toBeDefined();
    expect(valorBarra(servidor, p, "a")).toBe(1500);
  });

  it("props a medio camino: se sostiene igual", () => {
    const servidor = { a: 1200 };
    let p = anticipar(VACIO, "a", 1000, 500);
    p = reconciliar(p, servidor);
    expect(valorBarra(servidor, p, "a")).toBe(1500);
  });

  it("el servidor alcanza el monto: se suelta y manda el servidor", () => {
    let p = anticipar(VACIO, "a", 1000, 500);
    p = reconciliar(p, { a: 1500 });
    expect(p.a).toBeUndefined();
    expect(valorBarra({ a: 1500 }, p, "a")).toBe(1500);
  });

  it("tolera el redondeo a centavos del servidor", () => {
    let p = anticipar(VACIO, "a", 0, 333.333);
    // El servidor guarda 333.33; sin tolerancia el anticipo quedaría clavado.
    p = reconciliar(p, { a: 333.33 });
    expect(p.a).toBeUndefined();
  });
});

describe("varios recibidos seguidos", () => {
  it("dos clics esperan la SUMA de los dos", () => {
    let p = anticipar(VACIO, "a", 1000, 500);
    p = anticipar(p, "a", 1000, 300);
    expect(valorBarra({ a: 1000 }, p, "a")).toBe(1800);
    // Con sólo el primero reflejado, sigue sosteniendo.
    p = reconciliar(p, { a: 1500 });
    expect(p.a).toBeDefined();
    expect(valorBarra({ a: 1500 }, p, "a")).toBe(1800);
    // Con los dos, se suelta.
    p = reconciliar(p, { a: 1800 });
    expect(p.a).toBeUndefined();
  });

  it("filas distintas no se pisan", () => {
    let p = anticipar(VACIO, "a", 100, 50);
    p = anticipar(p, "b", 200, 25);
    expect(valorBarra({ a: 100, b: 200 }, p, "a")).toBe(150);
    expect(valorBarra({ a: 100, b: 200 }, p, "b")).toBe(225);
    p = reconciliar(p, { a: 150, b: 200 });
    expect(p.a).toBeUndefined();
    expect(p.b).toBeDefined();
  });
});

describe("la barra nunca baja en silencio", () => {
  it("si la escritura falla, el anticipo se suelta ENTERO", () => {
    // Reponer sólo una parte dejaría un número que nadie puede explicar. Quien
    // llama a `cancelar` es responsable de mostrar el error (toast).
    let p = anticipar(VACIO, "a", 1000, 500);
    p = cancelar(p, "a");
    expect(p.a).toBeUndefined();
    expect(valorBarra({ a: 1000 }, p, "a")).toBe(1000);
  });

  it("nunca muestra MENOS de lo que dice el servidor", () => {
    // Otra pestaña sumó más de lo anticipado: manda el servidor.
    const p = anticipar(VACIO, "a", 1000, 100);
    expect(valorBarra({ a: 5000 }, p, "a")).toBe(5000);
  });
});

describe("salidas de emergencia (no quedarse clavado)", () => {
  it("si el servidor BAJA de la base, el anticipo se suelta", () => {
    // El movimiento se borró en otra pestaña: esperar 1500 para siempre dejaría
    // la barra mintiendo. Se suelta y manda la verdad del servidor.
    let p = anticipar(VACIO, "a", 1000, 500);
    p = reconciliar(p, { a: 400 });
    expect(p.a).toBeUndefined();
    expect(valorBarra({ a: 400 }, p, "a")).toBe(400);
  });

  it("la fila desaparece del servidor → se suelta", () => {
    let p = anticipar(VACIO, "a", 1000, 500);
    p = reconciliar(p, {});
    expect(p.a).toBeUndefined();
  });
});

describe("bordes", () => {
  it("montos no positivos o no finitos no anticipan nada", () => {
    expect(anticipar(VACIO, "a", 100, 0)).toBe(VACIO);
    expect(anticipar(VACIO, "a", 100, -5)).toBe(VACIO);
    expect(anticipar(VACIO, "a", 100, NaN)).toBe(VACIO);
  });

  it("cancelar algo que no existe no rompe ni crea objeto nuevo", () => {
    expect(cancelar(VACIO, "a")).toBe(VACIO);
  });

  it("reconciliar sin cambios devuelve el MISMO objeto (no cicla el efecto)", () => {
    const p = anticipar(VACIO, "a", 1000, 500);
    expect(reconciliar(p, { a: 1000 })).toBe(p);
  });

  it("una fila sin anticipo muestra el servidor tal cual", () => {
    expect(valorBarra({ a: 700 }, VACIO, "a")).toBe(700);
    expect(valorBarra({}, VACIO, "z")).toBe(0);
  });
});
