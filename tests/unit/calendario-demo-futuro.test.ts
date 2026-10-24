/**
 * El catálogo tiene que enseñar SIEMPRE el estado «futuro» del calendario.
 *
 * La demo generaba gasto para los días transcurridos del mes. El día 30 o 31 eso son todos, así
 * que no quedaba ninguna celda futura y `charts-calendario.spec.ts` fallaba con «esperaba > 0
 * celdas `data-futuro`, recibió 0» — una vez al mes, sin que nadie hubiera tocado nada. Pasó el
 * 30-sep-2026 y tumbó un check obligatorio.
 *
 * Aflojar el spec habría sido lo cómodo y lo equivocado: el estado «futuro» es justo lo que esa
 * pantalla viene a enseñar. Lo que se arregla es la demo, reservando el último día del mes.
 *
 * Esto prueba la REGLA, no el módulo: la demo calcula a nivel de módulo contra el reloj real, así
 * que importarla desde un test la ataría al día en que corra — que es el bug que se está
 * arreglando.
 */
import { describe, it, expect } from "vitest";

/** La misma cuenta que hace `calendario-demo.tsx`. */
function diasConGasto(diaReal: number, diasDelMes: number): number {
  return Math.min(diaReal, diasDelMes - 1);
}

/**
 * Cuántas celdas quedan marcadas como futuras.
 *
 * Lo que decide `data-futuro` es `fecha > hoy`, NO si el día trae datos. Capar solo los días con
 * gasto y dejar el «hoy» real no arregla nada: el 30 de septiembre, «hoy» sigue siendo el 30 y
 * ningún día del mes queda después. Lo comprobé por las malas — el primer arreglo tocó un solo
 * eje y la corrida volvió a fallar con el mismo mensaje.
 *
 * Por eso la regla se prueba sobre el resultado que importa, y no sobre una de sus dos mitades.
 */
function celdasFuturas(diaReal: number, diasDelMes: number): number {
  const hoy = diasConGasto(diaReal, diasDelMes); // el día que ve el calendario, capado
  return diasDelMes - hoy;
}

describe("la demo del calendario siempre deja un día futuro", () => {
  it("a mitad de mes no cambia nada", () => {
    expect(diasConGasto(18, 30)).toBe(18);
    expect(diasConGasto(1, 31)).toBe(1);
  });

  it("el último día del mes reserva uno", () => {
    // Es el caso que rompía: septiembre 30, febrero 28, los meses de 31.
    expect(diasConGasto(30, 30)).toBe(29);
    expect(diasConGasto(31, 31)).toBe(30);
    expect(diasConGasto(28, 28)).toBe(27);
    expect(diasConGasto(29, 29)).toBe(28);
  });

  it("en CUALQUIER día de CUALQUIER mes queda al menos una celda futura", () => {
    for (const diasDelMes of [28, 29, 30, 31])
      for (let dia = 1; dia <= diasDelMes; dia++)
        expect(
          celdasFuturas(dia, diasDelMes),
          `día ${dia} de un mes de ${diasDelMes}`,
        ).toBeGreaterThan(0);
  });

  it("el «hoy» del calendario se mueve con los días de gasto, no por su cuenta", () => {
    // La mitad que me faltó la primera vez. Si `hoy` fuera el día real y los datos el capado, el
    // último día del mes seguiría sin celdas futuras y el mensaje de CI sería idéntico.
    const hoyReal = (dia: number) => dia;
    for (const diasDelMes of [28, 30, 31])
      expect(
        diasDelMes - hoyReal(diasDelMes),
        `con el «hoy» real, el día ${diasDelMes} no deja futuro`,
      ).toBe(0);
    for (const diasDelMes of [28, 30, 31])
      expect(celdasFuturas(diasDelMes, diasDelMes), "con el capado, sí").toBeGreaterThan(0);
  });
});
