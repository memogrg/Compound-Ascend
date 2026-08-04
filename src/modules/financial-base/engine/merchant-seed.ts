/**
 * Diccionario semilla de comercios → categoría de sistema, y la lista de categorías RETIRADAS.
 *
 * Vive en el engine (puro, sin `server-only`) y no dentro de `suggestion-service` para que un test
 * pueda mirarlo sin arrastrar el cliente de Supabase. Y hace falta que lo mire: la auditoría del
 * catálogo (2026-08-03) encontró que dos entradas de acá apuntaban a categorías GEMELAS muertas
 * — `alim_supermercado` («Supermercado», 0 transacciones) y `vivienda_alquiler` («Alquiler», 1) —
 * mientras el uso real estaba en `alim_super` (19 transacciones) y `viv_alquiler`. O sea que el
 * autocompletado le proponía a TODOS los usuarios una categoría que nadie usaba, y cada uno la
 * corregía a mano. Por eso el cache aprendido tenía sus filas en la canónica y esta tabla no.
 *
 * Peor todavía tras la consolidación: `buildSuggestionIndex` descarta las categorías inactivas
 * (`if (!cat || !cat.isActive) return`), así que una entrada apuntando a una retirada no se
 * equivoca — desaparece en silencio, y esos comercios se quedan sin sugerencia.
 */

/** Comercios frecuentes (Costa Rica/LatAm) → key de categoría destino. */
export const MERCHANT_SEED: { patterns: string[]; categoryKey: string }[] = [
  // Transporte
  { patterns: ["uber", "didi", "indriver"], categoryKey: "trans_uber" },
  { patterns: ["taxi"], categoryKey: "trans_taxi" },
  {
    patterns: ["gasolina", "combustible", "delta", "gas station", "servicentro"],
    categoryKey: "trans_combustible",
  },
  { patterns: ["peaje", "ruta 27"], categoryKey: "trans_peajes" },
  { patterns: ["parqueo", "parking"], categoryKey: "trans_parqueos" },
  { patterns: ["bus", "tren", "incofer"], categoryKey: "trans_bus" },
  { patterns: ["marchamo"], categoryKey: "auto_marchamo" },
  { patterns: ["riteve", "dekra", "revision tecnica"], categoryKey: "auto_revision" },
  // Alimentación
  {
    patterns: [
      "automercado",
      "walmart",
      "mas x menos",
      "masxmenos",
      "pricesmart",
      "perimercados",
      "super",
    ],
    // `alim_super` («Supermercados»), NO `alim_supermercado`: ver el comentario de arriba.
    categoryKey: "alim_super",
  },
  { patterns: ["feria"], categoryKey: "alim_feria" },
  {
    patterns: ["mcdonald", "kfc", "burger", "pizza", "rostipollo", "taco"],
    categoryKey: "alim_comida_rapida",
  },
  { patterns: ["starbucks", "cafe", "coffee", "britt"], categoryKey: "alim_cafe" },
  {
    patterns: ["uber eats", "rappi", "pedidosya", "glovo", "didi food"],
    categoryKey: "alim_delivery",
  },
  { patterns: ["restaurante", "rest "], categoryKey: "alim_restaurantes" },
  // Vivienda / servicios
  { patterns: ["alquiler", "renta"], categoryKey: "viv_alquiler" },
  { patterns: ["hipoteca"], categoryKey: "vivienda_hipoteca" },
  { patterns: ["ice", "cnfl", "electricidad", "luz"], categoryKey: "serv_luz" },
  { patterns: ["aya", "acueductos", "agua"], categoryKey: "serv_agua" },
  { patterns: ["internet", "cabletica", "tigo", "telecable"], categoryKey: "serv_internet" },
  { patterns: ["kolbi", "movistar", "claro", "celular", "recarga"], categoryKey: "serv_celular" },
  // Estilo de vida
  {
    patterns: ["netflix", "spotify", "hbo", "disney", "max", "youtube", "apple tv", "prime video"],
    categoryKey: "estilo_streaming",
  },
  { patterns: ["smartfit", "gimnasio", "gym", "crossfit"], categoryKey: "estilo_gimnasio" },
  { patterns: ["zara", "h&m", "ropa", "aeropostale"], categoryKey: "estilo_ropa" },
  // Salud
  { patterns: ["farmacia", "fischel", "sucre", "la bomba"], categoryKey: "salud_farmacia" },
  { patterns: ["clinica", "hospital", "consulta", "medico"], categoryKey: "salud_consultas" },
  { patterns: ["dentista", "dental", "odonto"], categoryKey: "salud_dental" },
  // Otros
  { patterns: ["amazon", "aliexpress", "temu", "shein"], categoryKey: "miscelaneos" },
];

/**
 * Categorías de sistema retiradas por la migración 20260811000001, con su canónica.
 *
 * Nada del código puede volver a apuntar a la izquierda. La BD ya no deja RE-CREARLAS (el trigger
 * `cat_sin_gemelas` rechaza una gemela dentro del mismo frasco), pero sí dejaría que una constante
 * de TypeScript siguiera nombrándolas — eso lo cubre el test.
 */
export const CATEGORIAS_RETIRADAS: Record<string, string> = {
  alim_supermercado: "alim_super",
  vivienda_alquiler: "viv_alquiler",
  auto_mantenimiento: "trans_mantenimiento",
};
