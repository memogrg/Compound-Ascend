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
import { isEmailIngestConfigured } from "@/lib/ingestion/email/imap-client";
import { openIngestMailbox, runEmailIngestPoll } from "@/lib/ingestion/email/run-poll";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
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

    const params = new URL(req.url).searchParams;

    // Modo diagnóstico: ?debug=1 devuelve, por correo, el remitente, asunto y
    // candidatos de destinatario + en qué nivel resolvería al dueño. NO procesa
    // ni marca leído: sirve para ver qué cabecera trae la dirección sobre
    // correos reales sin consumirlos. Los MÁS RECIENTES primero (el correo de
    // prueba que alguien acaba de mandar es el que se quiere ver), hasta `n`
    // (10 por defecto, máximo 50).
    if (params.get("debug")) {
      const box = await openIngestMailbox();
      try {
        const { messages, deps } = box;
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
      } finally {
        await box.close();
      }
    }

    const out = await runEmailIngestPoll();
    if (out.skipped) {
      return NextResponse.json({ ok: true, skipped: true, reason: out.reason }, { headers: cors });
    }
    return NextResponse.json({ ok: true, ...out, skipped: undefined }, { headers: cors });
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
