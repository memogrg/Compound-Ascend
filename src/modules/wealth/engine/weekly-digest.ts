/**
 * Digest patrimonial semanal (puro, sin IO). Arma {subject, html, text} a partir
 * del reporte. Aspiracional §13, nunca humillante. El `text` plano se reusa en
 * WhatsApp (5b-3c). El `html` NO incluye el footer de baja: el enlace (con token)
 * lo añade la capa de envío, manteniendo este builder puro y sin URLs.
 */
import { formatMoney } from "@/lib/format";
import { buildDailyPatrimonioInsight } from "@/modules/wealth/engine/daily-insight";
import type {
  PatrimonioReport,
  PatrimonioLevel,
  DiagnosisFlag,
} from "@/modules/wealth/engine/patrimonio-engine";

export type WeeklyDigest = { subject: string; html: string; text: string };

export type WeeklyDigestInput = {
  report: PatrimonioReport;
  level: PatrimonioLevel;
  diagnosis: DiagnosisFlag[];
  currency: string;
};

export function buildWeeklyDigest(input: WeeklyDigestInput): WeeklyDigest {
  const { report: r, level, diagnosis, currency } = input;
  const anios = Math.round(r.añosDeLibertad);
  const numero = formatMoney(r.numeroDeIndependencia, currency);
  // El paso del día (microacción o mensaje aspiracional) se reusa tal cual.
  const step = buildDailyPatrimonioInsight(r, level, diagnosis);

  const subject = `Tu semana patrimonial · Índice ${r.indice}/100`;

  const lines = [
    `Índice Patrimonial: ${r.indice}/100 (${level.name}).`,
    `Tu Número de Libertad: ${numero} (capital para vivir de tu patrimonio).`,
    `Tu patrimonio invertible te compra ${anios} ${anios === 1 ? "año" : "años"} de tu estilo de vida.`,
    `${step.title}: ${step.body}`,
  ];

  const text = [`Tu resumen semanal de patrimonio`, "", ...lines].join("\n");

  const html =
    `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1d23">` +
    `<h1 style="font-size:18px;margin:0 0 4px">Tu semana patrimonial</h1>` +
    `<p style="font-size:13px;color:#6b7280;margin:0 0 16px">Un vistazo a tu progreso hacia la libertad financiera.</p>` +
    `<p style="font-size:15px;margin:0 0 6px"><strong>Índice Patrimonial:</strong> ${r.indice}/100 (${level.name})</p>` +
    `<p style="font-size:15px;margin:0 0 6px"><strong>Tu Número de Libertad:</strong> ${numero}</p>` +
    `<p style="font-size:15px;margin:0 0 14px">Tu patrimonio invertible te compra <strong>${anios} ${anios === 1 ? "año" : "años"}</strong> de tu estilo de vida.</p>` +
    `<div style="background:#f3f4f6;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.5">` +
    `<strong>${step.title}</strong><br/>${step.body}</div>` +
    `</div>`;

  return { subject, html, text };
}
