/**
 * Reexporta `niceDomain` de `scale.ts`.
 *
 * El núcleo no duplica la escala: los tres wrappers actuales ya la usan y hacerla dos veces
 * garantizaría que un gráfico viejo y uno nuevo eligieran topes distintos para el mismo dato.
 * Este archivo existe para que el núcleo tenga una superficie única —todo se importa de
 * `charts/core`— sin mover el original mientras esos wrappers sigan vivos.
 */
export { niceDomain } from "../scale";
