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
  type ImapMessage,
} from "@/lib/ingestion/email/imap-poller";
import { createImapClient, isEmailIngestConfigured } from "@/lib/ingestion/email/imap-client";
import { lookupOwnerByForwarder } from "@/lib/ingestion/email/forwarder-lookup";
import { lookupOwnerByIngestAddress } from "@/lib/ingestion/email/address-lookup";

export const runtime = "nodejs";

const PROVIDER = "email_ingest";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Construye las dependencias del poller con service-role + el cliente IMAP. */
function buildDeps(
  supabase: ReturnType<typeof createServiceRoleClient>,
  markSeenUid: (uid: number) => Promise<void>,
): EmailIngestDeps {
  return {
    lookupByAddress: (candidates: string[]) => lookupOwnerByIngestAddress(supabase, candidates),

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

    async saveNotice(notice, owner): Promise<void> {
      const { error } = await supabase.from("ingest_notices").insert({
        user_id: owner.userId,
        household_id: owner.householdId,
        kind: notice.kind,
        from_address: notice.fromAddress,
        subject: notice.subject,
        snippet: notice.snippet,
        confirm_url: notice.confirmUrl,
        confirm_code: notice.confirmCode,
        message_id: notice.messageId,
      });
      // 23505 = ya estaba (mismo correo): idempotente, no es error.
      if (error && error.code !== "23505") {
        logger.warn("email-ingest: fallo al guardar aviso", { message: error.message });
      }
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

      // Modo diagnóstico: ?debug=1 devuelve, por correo, el remitente, asunto y
      // candidatos de destinatario + en qué nivel resolvería al dueño. NO procesa
      // ni marca leído: sirve para ver qué cabecera trae la dirección sobre
      // correos reales sin consumirlos. Los MÁS RECIENTES primero (el correo de
      // prueba que alguien acaba de mandar es el que se quiere ver), hasta `n`
      // (10 por defecto, máximo 50).
      const params = new URL(req.url).searchParams;
      if (params.get("debug")) {
        const n = Math.min(50, Math.max(1, Number(params.get("n")) || 10));
        const samples = [];
        for (const m of [...messages].reverse().slice(0, n)) {
          // Se prueban los cuatro niveles por separado para ver CUÁL resolvería:
          // es exactamente lo que hay que mirar al certificar un proveedor nuevo.
          const porSobre = await deps.lookupByAddress(m.envelopeTo);
          const porDireccion = await deps.lookupByAddress(m.recipients);
          const porDestinatario = await deps.lookupOwner(m.recipients);
          const porRemitente = m.senderCandidates.length
            ? await deps.lookupOwner(m.senderCandidates)
            : null;
          samples.push({
            from: m.from,
            subject: m.subject,
            receivedAt: m.receivedAt,
            envelopeTo: m.envelopeTo,
            recipients: m.recipients,
            fromAutenticado: m.senderCandidates.length > 0,
            porSobre: porSobre.status,
            porDireccion: porDireccion.status,
            porDestinatario: porDestinatario.status,
            porRemitente: porRemitente?.status ?? null,
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
    // #53 · diagnosabilidad: el error de imapflow trae la causa REAL en campos propios —no en
    // `.message`, que es el genérico "Command failed"—. Se loguean aparte para que un fallo de
    // ingesta deje de estar ciego (p. ej. serverResponseCode "AUTHENTICATIONFAILED" = App Password
    // muerto). No cambia el comportamiento del endpoint: sigue devolviendo 500 vía toSafeResponse.
    const e = err as {
      serverResponseCode?: unknown;
      responseText?: unknown;
      authenticationFailed?: unknown;
    };
    logger.error("email-ingest: fallo del poll IMAP", {
      message: err instanceof Error ? err.message : String(err),
      serverResponseCode: e.serverResponseCode,
      responseText: e.responseText,
      authenticationFailed: e.authenticationFailed,
    });
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
