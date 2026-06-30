/**
 * POST /api/ai/biblia/ingest
 * Ingesta RESUMIBLE de un documento grande al corpus biblia_chunks. El documento va como body
 * text/plain (ej. `curl --data-binary @archivo`); `tag` y `source` por query (?tag=&source=).
 *
 * Lógica: chunkDocument → dedup contra los contents ya presentes (mismo source) → embeber SOLO los
 * faltantes, en lotes de BATCH, hasta MAX_PER_CALL por request → upsert onConflict content.
 * RESUMIBLE: re-llamar con el MISMO documento avanza hasta remaining=0. Idempotente.
 *
 * Acceso: SOLO cron (X-Cron-Secret o Bearer CRON_SECRET). Service-role. No toca datos de usuario.
 */
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

// La API de embeddings no publica un máximo fijo por :batchEmbedContents; usamos un lote
// conservador (bajo el cap de tamaño de payload reportado) y un tope de chunks nuevos por
// request para no chocar con el timeout de la función (resumibilidad).
const BATCH = 25;
const MAX_PER_CALL = 80;

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type IngestRow = { tag: string; content: string; embedding: number[] | null; source: string };

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");

    const url = new URL(req.url);
    const tag = url.searchParams.get("tag")?.trim() || "documento";
    const source = url.searchParams.get("source")?.trim() || "documento";
    const text = await req.text();

    const { chunkDocument } = await import("@/lib/ai/biblia-corpus");
    const { embedTexts } = await import("@/lib/ai/providers/gemini");
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");

    const chunks = chunkDocument(text);
    const total = chunks.length;
    if (total === 0) {
      return NextResponse.json({ ingested: 0, skipped: 0, remaining: 0, total: 0 }, { headers: cors });
    }

    const supabase = createServiceRoleClient();

    // Dedup: contents ya presentes para este source (evita re-embeber → resumibilidad barata).
    const { data: existingRows } = await supabase
      .from("biblia_chunks")
      .select("content")
      .eq("source", source);
    const existing = new Set((existingRows ?? []).map((r) => r.content));

    const missing = chunks.filter((c) => !existing.has(c));
    const skipped = total - missing.length;
    const batchNow = missing.slice(0, MAX_PER_CALL);

    // Embeddings en lotes ≤ BATCH (RETRIEVAL_DOCUMENT), alineados con batchNow.
    const vectors: number[][] = [];
    for (let i = 0; i < batchNow.length; i += BATCH) {
      const slice = batchNow.slice(i, i + BATCH);
      vectors.push(...(await embedTexts(slice, "RETRIEVAL_DOCUMENT")));
    }

    if (batchNow.length > 0) {
      const rows: IngestRow[] = batchNow.map((content, i) => ({
        tag,
        content,
        embedding: vectors[i] ?? null,
        source,
      }));
      const { error } = await supabase.from("biblia_chunks").upsert(rows, { onConflict: "content" });
      if (error) throw new AppError("INTERNAL", undefined, error.message);
    }

    const remaining = missing.length - batchNow.length;
    return NextResponse.json(
      { ingested: batchNow.length, skipped, remaining, total },
      { headers: cors },
    );
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
