/**
 * GET/POST /api/debts/reminders
 * Envía recordatorios por correo de cuotas de deuda próximas a vencer (≤2 días)
 * sin pago del mes. Cron diario.
 *
 * Acceso: SOLO cron (igual patrón que /api/indicators/refresh):
 *  - Header X-Cron-Secret = CRON_SECRET, o
 *  - Authorization: Bearer <CRON_SECRET> (el que añade Vercel Cron).
 *
 * Usa service-role (recorre deudas de todos los usuarios). Tolera fallos por
 * deuda y no reenvía si ya se recordó hoy (last_reminded_on).
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${Number(d)} de ${months[Number(m) - 1] ?? ""} de ${y}`;
}

async function handle(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");

    const { getDueReminders, markReminded } =
      await import("@/modules/control/services/debt-reminders-service");
    const { sendEmail, isEmailConfigured } = await import("@/lib/email/send");

    const reminders = await getDueReminders();
    let sent = 0;
    let skipped = 0;
    const emailReady = isEmailConfigured();

    for (const r of reminders) {
      if (!emailReady || !r.email) {
        skipped += 1;
        continue;
      }
      try {
        const cuota = formatMoney(r.payment, r.currency);
        const banco = r.bank ? ` del banco ${r.bank}` : "";
        const subject = `Recordatorio: tu pago de ${r.name} vence el ${fmtDate(r.nextDue)}`;
        const html =
          `<p>Hola,</p>` +
          `<p>Tu cuota de <strong>${r.name}</strong>${banco} por <strong>${cuota}</strong> ` +
          `vence el <strong>${fmtDate(r.nextDue)}</strong>.</p>` +
          `<p>Págala a tiempo para evitar intereses y cargos por mora.</p>` +
          `<p style="color:#888;font-size:12px">Compound Ascend · recordatorio automático</p>`;

        const res = await sendEmail({ to: r.email, subject, html });
        if (res.ok) {
          await markReminded(r.debtId);
          sent += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        skipped += 1;
        logger.error("debt-reminder fallido", {
          debtId: r.debtId,
          message: err instanceof Error ? err.message : "?",
        });
      }
    }

    return NextResponse.json(
      { ok: true, candidates: reminders.length, sent, skipped },
      { headers: cors },
    );
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
