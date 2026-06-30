import "server-only";

/**
 * Sugerencia de sobre por IA, ACOTADA A LOS SOBRES DEL PROPIO USUARIO (sin taxonomía
 * canónica) y token-frugal: caché por (usuario, comercio) → cada comercio cuesta a lo sumo
 * 1 llamada de IA en su vida, con un tope de llamadas NUEVAS por carga. Sesión → RLS.
 *
 * Solo SUGIERE (pre-rellena el selector en "Por clasificar"); NO auto-asigna al registrar.
 */
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { listCategories } from "@/modules/financial-base/services/categories-service";
import {
  selectableCategoryLeaves,
  categoryMatchesKind,
} from "@/modules/financial-base/engine/classify";
import { normalize } from "@/lib/ai/biblia-knowledge";
import { logger } from "@/lib/logger";

export type Sobre = { id: string; name: string };
export type Suggestion = { categoryId: string | null; confidence: number };

/** Tope de llamadas NUEVAS a la IA por invocación (acota costo/latencia por carga). */
export const MAX_NEW_SUGGESTION_CALLS = 8;

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/** Extrae el primer objeto JSON aunque venga con ```json o texto alrededor. */
function parseSuggestion(text: string): { categoryId: string | null; confidence: number } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as { categoryId?: unknown; confidence?: unknown };
    return {
      categoryId: typeof obj.categoryId === "string" ? obj.categoryId : null,
      confidence: typeof obj.confidence === "number" ? obj.confidence : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Pide a la IA el sobre de `merchant` SOLO entre `sobres`. Devuelve siempre algo seguro: si
 * la IA no está configurada, no responde JSON, o elige un id fuera de la lista → categoryId
 * null. Una sola llamada barata, sin estado.
 */
export async function suggestSobre(merchant: string, sobres: Sobre[]): Promise<Suggestion> {
  const provider = createGeminiProvider();
  if (!provider || sobres.length === 0) return { categoryId: null, confidence: 0 };

  const lista = sobres.map((s) => `${s.id}: ${s.name}`).join("\n");
  const system =
    "Sos un clasificador de gastos personales. Te doy un COMERCIO y una lista de SOBRES " +
    "(categorías) con su id. Elegí el sobre que mejor corresponda, SOLO de la lista. " +
    'Respondé ÚNICAMENTE un JSON: {"categoryId": "<id de la lista o null>", "confidence": <0..1>}. ' +
    "Sin texto extra. Si ninguno aplica, categoryId null.";
  const user = `COMERCIO: ${merchant}\nSOBRES:\n${lista}`;

  try {
    const res = await provider.chat({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 60,
    });
    const parsed = parseSuggestion(res.text);
    if (!parsed) return { categoryId: null, confidence: 0 };
    const valid = parsed.categoryId != null && sobres.some((s) => s.id === parsed.categoryId);
    return { categoryId: valid ? parsed.categoryId : null, confidence: clamp01(parsed.confidence) };
  } catch (err) {
    logger.warn("suggestSobre falló", { message: err instanceof Error ? err.message : "?" });
    return { categoryId: null, confidence: 0 };
  }
}

export type SuggestItem = { id: string; merchant: string | null; kind: "gasto" | "ingreso" };

/**
 * Sugerencias para una lista de movimientos sin clasificar. Por cada COMERCIO distinto
 * (normalizado): cache hit en merchant_suggestion_cache → usar; si miss y hay sobres de esa
 * naturaleza → suggestSobre y guardar (incluido el "ninguno", para no re-llamar), con tope de
 * MAX_NEW_SUGGESTION_CALLS llamadas nuevas. Devuelve solo las entradas con sobre sugerido.
 */
export async function getSuggestionsFor(items: SuggestItem[]): Promise<Map<string, Suggestion>> {
  const out = new Map<string, Suggestion>();
  const withMerchant = items.filter((i) => i.merchant && i.merchant.trim());
  if (withMerchant.length === 0) return out;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const leaves = selectableCategoryLeaves(await listCategories());

  const normOf = (i: SuggestItem) => normalize(i.merchant!.trim());
  const norms = [...new Set(withMerchant.map(normOf))];

  // 1) Cache hits en bloque.
  const cache = new Map<string, Suggestion>();
  const { data: cached } = await supabase
    .from("merchant_suggestion_cache")
    .select("merchant_norm, category_id, confidence")
    .in("merchant_norm", norms);
  for (const row of cached ?? []) {
    cache.set(row.merchant_norm, {
      categoryId: row.category_id,
      confidence: Number(row.confidence ?? 0),
    });
  }

  // 2) Misses: llamar a la IA hasta el tope y cachear el resultado.
  let newCalls = 0;
  for (const norm of norms) {
    if (cache.has(norm)) continue;
    if (newCalls >= MAX_NEW_SUGGESTION_CALLS) continue;

    const sample = withMerchant.find((i) => normOf(i) === norm)!;
    const sobres = leaves
      .filter((c) => categoryMatchesKind(c.categoryType, sample.kind))
      .map((c) => ({ id: c.id, name: c.name }));
    if (sobres.length === 0) continue;

    newCalls++;
    const sug = await suggestSobre(sample.merchant!.trim(), sobres);
    cache.set(norm, sug);
    try {
      await supabase
        .from("merchant_suggestion_cache")
        .upsert(
          {
            user_id: user.id,
            merchant_norm: norm,
            category_id: sug.categoryId,
            confidence: sug.confidence,
          },
          { onConflict: "user_id,merchant_norm" },
        );
    } catch (err) {
      logger.warn("merchant_suggestion_cache upsert falló", {
        message: err instanceof Error ? err.message : "?",
      });
    }
  }

  // 3) Mapear cada txn a su sugerencia (solo las que tienen sobre).
  for (const it of withMerchant) {
    const sug = cache.get(normOf(it));
    if (sug && sug.categoryId) out.set(it.id, sug);
  }
  return out;
}
