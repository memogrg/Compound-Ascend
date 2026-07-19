import "server-only";
import { householdMemberIds } from "@/lib/household/active";

/**
 * Autocompletado inteligente DETERMINISTA (sin IA todavía). Construye un índice
 * de patrones → categoría a partir de tres fuentes, en orden de prioridad:
 *   1. Historial del usuario (último comercio → categoría usada).  peso 100
 *   2. Reglas explícitas del usuario (transaction_rules).           peso 80
 *   3. Diccionario semilla de comercios comunes (Costa Rica/LatAm). peso 40
 *
 * El índice se entrega al cliente para hacer match instantáneo mientras el
 * usuario escribe (p. ej. "Uber" → Transporte › Uber). La arquitectura está
 * lista para que un futuro motor de IA reemplace/realce este índice.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { listCategories } from "@/modules/financial-base/services/categories-service";
import { listRules } from "@/modules/financial-base/services/rules-service";

export type SuggestionEntry = {
  pattern: string; // texto en minúsculas a buscar como substring
  categoryId: string;
  categoryName: string;
  weight: number; // mayor gana
};

/** Diccionario semilla: comercios frecuentes → key de categoría destino. */
const SEED: { patterns: string[]; categoryKey: string }[] = [
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
    categoryKey: "alim_supermercado",
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
  { patterns: ["alquiler", "renta"], categoryKey: "vivienda_alquiler" },
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
 * Construye el índice de sugerencias para el tipo dado. Solo gastos por ahora
 * (los ingresos usan "fuente" libre, no categoría).
 */
export async function buildSuggestionIndex(): Promise<SuggestionEntry[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const memberIds = await householdMemberIds(supabase, user.id);
  const [cats, rules, history] = await Promise.all([
    listCategories(),
    listRules(),
    supabase
      .from("transactions")
      .select("merchant_or_source,category_id,occurred_on")
      .in("user_id", memberIds)
      .eq("kind", "gasto")
      .not("merchant_or_source", "is", null)
      .not("category_id", "is", null)
      .order("occurred_on", { ascending: false })
      .limit(300),
  ]);

  const byKey = new Map(cats.filter((c) => c.key).map((c) => [c.key as string, c]));
  const byId = new Map(cats.map((c) => [c.id, c]));
  const entries: SuggestionEntry[] = [];
  const seen = new Set<string>();

  const push = (pattern: string, categoryId: string, weight: number) => {
    const cat = byId.get(categoryId);
    if (!cat || !cat.isActive) return;
    const p = pattern.trim().toLowerCase();
    if (!p) return;
    const dedupe = `${p}::${categoryId}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    entries.push({ pattern: p, categoryId, categoryName: cat.name, weight });
  };

  // 1) Historial (gana). Primera aparición = más reciente por el order desc.
  const histSeen = new Set<string>();
  for (const r of history.data ?? []) {
    const merchant = (r.merchant_or_source ?? "").trim().toLowerCase();
    if (!merchant || !r.category_id || histSeen.has(merchant)) continue;
    histSeen.add(merchant);
    push(merchant, r.category_id, 100);
  }

  // 2) Reglas del usuario.
  for (const rule of rules) {
    if (rule.type === "expense" && rule.suggestedCategoryId) {
      push(rule.merchantPattern, rule.suggestedCategoryId, 80);
    }
  }

  // 3) Diccionario semilla.
  for (const seed of SEED) {
    const cat = byKey.get(seed.categoryKey);
    if (!cat) continue;
    for (const pat of seed.patterns) push(pat, cat.id, 40);
  }

  return entries;
}

/** Resuelve la mejor sugerencia para un texto (uso servidor; el cliente replica). */
export function matchSuggestion(
  text: string | null | undefined,
  index: SuggestionEntry[],
): SuggestionEntry | null {
  if (!text) return null;
  const hay = text.trim().toLowerCase();
  if (!hay) return null;
  let best: SuggestionEntry | null = null;
  for (const e of index) {
    if (hay.includes(e.pattern)) {
      const score = e.weight + e.pattern.length; // patrón más específico desempata
      if (!best || score > best.weight + best.pattern.length) best = e;
    }
  }
  return best;
}
