/**
 * POST /api/ai/biblia/reseed
 * Siembra (idempotente) el corpus semántico de la Biblia: embebe BIBLIA_SEED_ENTRIES con
 * RETRIEVAL_DOCUMENT y hace UPSERT en biblia_chunks (onConflict content → re-correr no duplica).
 * Con body opcional { documentText } parte el documento en chunks y los ingesta también.
 *
 * Acceso: SOLO cron (X-Cron-Secret o Bearer CRON_SECRET). No toca datos de usuario.
 */
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type SeedRow = { tag: string; content: string; embedding: number[] | null; source: string };

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");

    const body = (await req.json().catch(() => ({}))) as { documentText?: string };

    const { BIBLIA_SEED_ENTRIES, chunkDocument } = await import("@/lib/ai/biblia-corpus");
    const { embedTexts } = await import("@/lib/ai/providers/gemini");
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");

    // Corpus curado + (opcional) chunks del documento → entradas a sembrar.
    const entries: { tag: string; content: string; source: string }[] = [
      ...BIBLIA_SEED_ENTRIES.map((e) => ({ tag: e.tag, content: e.content, source: "curado" })),
      ...(typeof body.documentText === "string" && body.documentText.trim()
        ? chunkDocument(body.documentText).map((content) => ({
            tag: "documento",
            content,
            source: "documento",
          }))
        : []),
    ];

    if (entries.length === 0) {
      return NextResponse.json({ seeded: 0, total: 0 }, { headers: cors });
    }

    // Embeddings en lote (RETRIEVAL_DOCUMENT) alineados con el orden de `entries`.
    const vectors = await embedTexts(
      entries.map((e) => e.content),
      "RETRIEVAL_DOCUMENT",
    );
    const rows: SeedRow[] = entries.map((e, i) => ({
      tag: e.tag,
      content: e.content,
      embedding: vectors[i] ?? null,
      source: e.source,
    }));

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("biblia_chunks")
      .upsert(rows, { onConflict: "content" });
    if (error) throw new AppError("INTERNAL", undefined, error.message);

    // Total de chunks en el corpus tras el upsert (idempotencia: re-correr no lo sube).
    const { count } = await supabase
      .from("biblia_chunks")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({ seeded: rows.length, total: count ?? rows.length }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
