import { describe, it, expect, beforeEach } from "vitest";

import { pushOverlay, closeTopOverlay } from "@/app/(mobile)/m/lib/overlay-stack";

/**
 * La pila que decide qué cierra el botón Atrás de Android. Es estado de MÓDULO, así que
 * cada prueba la vacía primero: si una prueba dejara algo abierto, la siguiente cerraría
 * lo que no es y el fallo aparecería en el test equivocado.
 */
beforeEach(() => {
  while (closeTopOverlay()) {
    /* vaciar */
  }
});

describe("overlay-stack", () => {
  it("cierra el ÚLTIMO que se abrió (LIFO)", () => {
    const orden: string[] = [];
    pushOverlay(() => orden.push("hoja"));
    pushOverlay(() => orden.push("dialogo"));

    expect(closeTopOverlay()).toBe(true);
    expect(closeTopOverlay()).toBe(true);
    expect(orden).toEqual(["dialogo", "hoja"]);
  });

  it("con la pila vacía devuelve false: el gesto le toca a quien preguntó", () => {
    expect(closeTopOverlay()).toBe(false);
  });

  it("dar de baja dos veces no saca a otro overlay", () => {
    const cerrados: string[] = [];
    const baja = pushOverlay(() => cerrados.push("primero"));
    pushOverlay(() => cerrados.push("segundo"));

    baja();
    baja(); // idempotente: la segunda no toca la pila

    expect(closeTopOverlay()).toBe(true);
    expect(closeTopOverlay()).toBe(false);
    expect(cerrados).toEqual(["segundo"]);
  });

  it("dar de baja uno que NO es el tope deja el orden intacto", () => {
    const cerrados: string[] = [];
    pushOverlay(() => cerrados.push("a"));
    const bajaB = pushOverlay(() => cerrados.push("b"));
    pushOverlay(() => cerrados.push("c"));

    bajaB(); // se cierra por debajo de "c", p. ej. al desmontarse su pantalla

    expect(closeTopOverlay()).toBe(true);
    expect(closeTopOverlay()).toBe(true);
    expect(closeTopOverlay()).toBe(false);
    expect(cerrados).toEqual(["c", "a"]);
  });

  it("el cierre corre DESPUÉS de sacarlo de la pila: su propia baja no arrastra a otro", () => {
    const cerrados: string[] = [];
    pushOverlay(() => cerrados.push("de-abajo"));
    // Un overlay real se da de baja solo en la limpieza del efecto, disparada por su
    // onClose. Si closeTopOverlay cerrara ANTES de sacarlo, esa baja sacaría al de abajo.
    const baja: (() => void)[] = [];
    baja.push(
      pushOverlay(() => {
        cerrados.push("de-arriba");
        baja[0]?.();
      }),
    );

    expect(closeTopOverlay()).toBe(true);
    expect(closeTopOverlay()).toBe(true);
    expect(cerrados).toEqual(["de-arriba", "de-abajo"]);
  });
});
