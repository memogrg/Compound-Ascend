/**
 * POST/GET /api/ingest/email/poll
 * Poller de ingesta por correo: lee el buzón IMAP (donde los usuarios reenvían
 * sus correos de banco), identifica al usuario por el destinatario original del
 * reenvío (forwarder_email en la allowlist), deduplica, parsea y deja la
 * propuesta en cola (ingest_proposals, status 'pending').
 *
 * Este delta NO entrega nada al usuario (eso es el Delta 2). Nada se confirma
 * solo: las propuestas quedan 'pending' hasta que el usuario las acepte.
 *
 * Acceso: SOLO cron. X-Cron-Secret = CRON_SECRET, o Authorization: Bearer
 * <CRON_SECRET> (el que añade Vercel Cron). Escritura con service-role (sin
 * sesión de usuario); la allowlist es la capa que evita procesar remitentes
 * arbitrarios.
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseNotification } from "@/lib/ingestion/sources";
import {
  fetchUnseen,
  processInboundEmails,
  type EmailIngestDeps,
  type EmailOwner,
  type ImapMessage,
} from "@/lib/ingestion/email/imap-poller";
import { createImapClient, isEmailIngestConfigured } from "@/lib/ingestion/email/imap-client";

export const runtime = "nodejs";

const PROVIDER = "email_ingest";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Resuelve el dueño por forwarder_email. SOLO filas VERIFICADAS (verified=true): el
 * poller no procesa remitentes sin verificar (onboarding self-serve). forwarder_email
 * es citext → comparación case-insensitive. Exportada para testear el filtro.
 */
export async function lookupOwnerByForwarder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  candidates: string[],
): Promise<EmailOwner | null> {
  if (candidates.length === 0) return null;
  const { data, error } = await supabase
    .from("email_ingest_links")
    .select("user_id, household_id")
    .eq("verified", true)
    .in("forwarder_email", candidates)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id, householdId: data.household_id };
}

/** Construye las dependencias del poller con service-role + el cliente IMAP. */
function buildDeps(
  supabase: ReturnType<typeof createServiceRoleClient>,
  markSeenUid: (uid: number) => Promise<void>,
): EmailIngestDeps {
  return {
    lookupOwner: (candidates: string[]) => lookupOwnerByForwarder(supabase, candidates),

    async isProcessed(eventId: string): Promise<boolean> {
      const { data } = await supabase
        .from("processed_events")
        .select("event_id")
        .eq("provider", PROVIDER)
        .eq("event_id", eventId)
        .maybeSingle();
      return Boolean(data);
    },

    async markProcessed(eventId: string): Promise<void> {
      await supabase
        .from("processed_events")
        .upsert(
          { provider: PROVIDER, event_id: eventId },
          { onConflict: "provider,event_id", ignoreDuplicates: true },
        );
    },

    async saveProposals(movements, owner): Promise<{ inserted: number; duplicated: number }> {
      let inserted = 0;
      let duplicated = 0;
      // Insert por fila para distinguir choques: el índice único es por expresión
      // (coalesce(household_id,user_id), external_ref) y parcial, así que no se
      // puede targetear con onConflict de PostgREST. Una violación 23505 = la misma
      // compra (cuenta, referencia) ya estaba → se cuenta como duplicado.
      for (const m of movements) {
        const { error } = await supabase.from("ingest_proposals").insert({
          user_id: owner.userId,
          household_id: owner.householdId,
          kind: m.kind,
          amount: m.amount,
          currency: m.currency,
          occurred_on: m.occurredOn,
          merchant: m.merchant,
          description: m.description,
          bank_code: m.bankCode,
          external_ref: m.externalRef,
          source_kind: m.sourceKind,
          confidence: m.confidence,
          status: "pending" as const,
          card_last4: m.cardLast4 ?? null,
          raw_text: m.rawText,
        });
        if (!error) {
          inserted += 1;
        } else if (error.code === "23505") {
          duplicated += 1;
        } else {
          logger.warn("email-ingest: fallo al insertar propuesta", { message: error.message });
        }
      }
      return { inserted, duplicated };
    },

    async markSeen(message: ImapMessage): Promise<void> {
      try {
        await markSeenUid(message.uid);
      } catch (err) {
        // Best-effort: si no se pudo marcar leído, el dedup por processed_events
        // evita reprocesar; solo quedará como no leído en el buzón.
        logger.warn("email-ingest: no se pudo marcar leído", {
          uid: message.uid,
          message: err instanceof Error ? err.message : "?",
        });
      }
    },
  };
}

async function handle(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");

    if (!isEmailIngestConfigured()) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: "IMAP de ingesta no configurado" },
        { headers: cors },
      );
    }

    const client = await createImapClient();
    try {
      const messages = await fetchUnseen(client);
      const supabase = createServiceRoleClient();
      const deps = buildDeps(supabase, (uid) => client.markSeen(uid));

      // Modo diagnóstico: ?debug=1 devuelve, por correo (hasta 10), el remitente,
      // asunto y candidatos de destinatario + si matchean un forwarder conocido.
      // NO procesa ni marca leído: sirve para ver qué cabecera trae la dirección
      // sobre correos reales sin consumirlos.
      if (new URL(req.url).searchParams.get("debug")) {
        const samples = [];
        for (const m of messages.slice(0, 10)) {
          const owner = await deps.lookupOwner(m.recipients);
          samples.push({
            from: m.from,
            subject: m.subject,
            recipients: m.recipients,
            matched: Boolean(owner),
          });
        }
        return NextResponse.json(
          { ok: true, debug: true, total: messages.length, samples },
          { headers: cors },
        );
      }

      const summary = await processInboundEmails(messages, parseNotification, deps);
      return NextResponse.json({ ok: true, ...summary }, { headers: cors });
    } finally {
      await client.close().catch(() => {});
    }
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function GET(req: Request) {
  return handle(req);
}

export function POST(req: Request) {
  return handle(req);
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
