/**
 * Reexporta `niceDomain` de `scale.ts`.
 *
 * El núcleo no duplica la escala: los tres wrappers actuales ya la usan y hacerla dos veces
 * garantizaría que un gráfico viejo y uno nuevo eligieran topes distintos para el mismo dato.
 * Este archivo existe para que el núcleo tenga una superficie única —todo se importa de
 * `charts/core`— sin mover el original mientras esos wrappers sigan vivos.
 */
import { niceDomain, niceEscala } from "../scale";

export { niceDomain };

/**
 * Dominio del eje Y para un gráfico de BARRAS: siempre desde 0.
 *
 * Una barra codifica su valor con el ÁREA que ocupa, así que cortar la base miente: con el
 * eje arrancando en 1,5 M, una barra de 2,3 M parece el doble que una de 1,9 M cuando la
 * diferencia real es del 20 %. Es el error clásico de los gráficos que exageran. En una
 * línea el recorte es legítimo —ahí lo que se lee es la pendiente— y por eso esto es una
 * función aparte y no el comportamiento por defecto de `niceDomain`.
 *
 * `zeroBased` ya existía en `niceDomain`; esto le pone nombre al caso para que quien monte
 * un `BarChart` no tenga que acordarse de la opción.
 */
export function dominioBarras(valores: number[], ticks?: number): [number, number] {
  return escalaBarras(valores, ticks).dominio;
}

/**
 * La escala completa de un gráfico de BARRAS: dominio Y ticks.
 *
 * Lo mismo que le pasaba a los ejes de línea: devolver solo el dominio deja que Recharts
 * elija sus propios ticks dentro, y con [0, 3 M] repartía cinco a partes iguales —uno caía
 * en 2,25 M y salía «₡2,3M»—. El catálogo tenía ese rótulo en la barra de ingresos y gastos.
 */
export function escalaBarras(
  valores: number[],
  ticks?: number,
): { dominio: [number, number]; ticks: number[] } {
  const finitos = valores.filter((v) => Number.isFinite(v));
  const max = finitos.length ? Math.max(...finitos) : 0;
  const min = finitos.length ? Math.min(...finitos) : 0;

  // Con un número de divisiones FIJO, `zeroBased` deja un tope absurdo: para un máximo de
  // 2,52 M y 4 ticks da [0, 4 M], y las barras quedan a media altura con medio gráfico
  // vacío. El paso «nice» se calcula sobre el span, y al forzar el 0 el span crece de golpe.
  // Se prueban varios conteos y gana el que menos aire deja por encima del máximo — que es
  // lo que alguien haría a ojo, y da ticks igual de redondos.
  const candidatos = (ticks ? [ticks] : [4, 5, 6]).map((t) =>
    niceEscala(finitos, { zeroBased: true, ticks: t }),
  );
  const validos = candidatos.filter((c) => c.dominio[1] >= max);
  const elegido = (validos.length ? validos : candidatos).reduce((a, b) =>
    b.dominio[1] < a.dominio[1] ? b : a,
  );

  // Sin valores negativos, la base es 0 y no un número por debajo: la rama de «serie plana»
  // de `niceEscala` abre un rango simétrico, así que una serie toda a cero daba [-1, 1] y la
  // barra arrancaba por encima del eje.
  const base = min < 0 ? elegido.dominio[0] : 0;
  return {
    dominio: [base, elegido.dominio[1]],
    ticks: elegido.ticks.filter((t) => t >= base),
  };
}
