#!/usr/bin/env node
/**
 * Reparte el inventario de rutas entre shards, para que la captura quepa en CI.
 *
 * La regla que importa no es que los trozos sean parecidos: es que **la unión sea el
 * inventario entero, sin repetir y sin saltarse nada**. Un shard que pierde una ruta no da
 * error — da un diff PARCIAL, o peor, uno que parece completo —, y esa es la familia de
 * fallos que más caro ha salido acá: el arnés que no falla, sino que mide otra cosa.
 *
 * El reparto es por POSICIÓN y determinista (`i % total`), no por hash ni aleatorio: la base
 * y la rama tienen que capturar exactamente el mismo conjunto en cada shard, o el diff
 * compararía cosas distintas sin avisar.
 *
 * @param {readonly {path: string}[]} rutas
 * @param {number} shard  1-based
 * @param {number} total
 */
export function repartirEnShards(rutas, shard, total) {
  const n = Number(total);
  const s = Number(shard);
  if (!Number.isInteger(n) || n < 1) throw new Error(`total de shards inválido: ${total}`);
  if (!Number.isInteger(s) || s < 1 || s > n) {
    throw new Error(`shard ${shard} fuera de rango para ${n} shard(s)`);
  }
  return rutas.filter((_, i) => i % n === s - 1);
}
