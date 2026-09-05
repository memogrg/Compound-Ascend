import "server-only";

/**
 * Corredor del poller de ingesta por correo, compartido por el cron
 * (/api/ingest/email/poll) y por el botón «Buscar avisos ahora» de Configuración.
 * Abre el buzón IMAP, arma las dependencias con service-role y procesa lo no
 * leído. Sin sesión de usuario: quien lo llama decide quién puede dispararlo.
 */
import { logger } from "@/lib/logger";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseNotification } from "@/lib/ingestion/sources";
import {
  fetchUnseen,
  processInboundEmails,
  type EmailIngestDeps,
  type ImapClient,
  type ImapMessage,
  type IngestSummary,
} from "@/lib/ingestion/email/imap-poller";
import { createImapClient, isEmailIngestConfigured } from "@/lib/ingestion/email/imap-client";
import { lookupOwnerByForwarder } from "@/lib/ingestion/email/forwarder-lookup";
import { lookupOwnerByIngestAddress } from "@/lib/ingestion/email/address-lookup";

const PROVIDER = "email_ingest";

/** Construye las dependencias del poller con service-role + el cliente IMAP. */
export function buildDeps(
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

/** Buzón abierto + mensajes sin leer + deps listas. Quien lo usa debe cerrar con `close()`. */
export async function openIngestMailbox(): Promise<{
  client: ImapClient;
  messages: ImapMessage[];
  deps: EmailIngestDeps;
  close: () => Promise<void>;
}> {
  const client = await createImapClient();
  const messages = await fetchUnseen(client);
  const supabase = createServiceRoleClient();
  const deps = buildDeps(supabase, (uid) => client.markSeen(uid));
  return { client, messages, deps, close: () => client.close().catch(() => {}) };
}

export type PollOutcome = { skipped: true; reason: string } | ({ skipped: false } & IngestSummary);

// Dos corridas simultáneas (cron + botón) leerían los mismos correos no leídos. El dedup por
// processed_events y los índices únicos lo hacen inocuo, pero no tiene sentido gastar dos
// conexiones IMAP: en la misma instancia se serializan.
let enCurso: Promise<PollOutcome> | null = null;

async function runOnce(): Promise<PollOutcome> {
  if (!isEmailIngestConfigured()) {
    return { skipped: true, reason: "IMAP de ingesta no configurado" };
  }
  const box = await openIngestMailbox();
  try {
    const summary = await processInboundEmails(box.messages, parseNotification, box.deps);
    return { skipped: false, ...summary };
  } finally {
    await box.close();
  }
}

/** Corre el poller completo una vez. Si ya hay una corrida en esta instancia, se suma a ella. */
export function runEmailIngestPoll(): Promise<PollOutcome> {
  if (enCurso) return enCurso;
  const p = runOnce().finally(() => {
    enCurso = null;
  });
  enCurso = p;
  return p;
}
