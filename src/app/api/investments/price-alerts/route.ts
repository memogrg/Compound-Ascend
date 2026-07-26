/**
 * GET/POST /api/investments/price-alerts — barrido de alertas de precio. Cron.
 *
 * Por cada símbolo distinto con alertas activas trae el precio UNA vez
 * (getMarketPrice), compara contra cada alerta (above/below) y, si cruzó, avisa por
 * los canales activos del usuario (email + campana in-app, según preferencias) y
 * marca triggered_at (desactiva si one_shot → no re-avisa). Best-effort: si un símbolo
 * falla, sigue con los demás.
 *
 * Acceso SOLO cron (igual patrón que /api/debts/reminders): X-Cron-Secret = CRON_SECRET
 * o Authorization: Bearer <CRON_SECRET>. Usa service-role (recorre todos los usuarios).
 *
 * NO es tiempo real: la alerta es tan oportuna como el cron (ver cadencia en vercel.json).
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { escapeHtml } from "@/lib/security/escape-html";
import { toSafeResponse, AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { logger } from "@/lib/logger";
import type { AssetType as MarketAssetType } from "@/lib/market-data";
import type { ActivePriceAlert } from "@/modules/wealth/services/price-alerts-service";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** asset_type del holding → tipo de mercado de getMarketPrice. */
const MARKET_TYPE: Partial<Record<string, MarketAssetType>> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

/**
 * Notifica una alerta disparada por los canales ACTIVOS del usuario (email + campana).
 * Respeta las preferencias: si apagó email/inApp, no le manda por ahí. Copy con
 * disclaimer (no es asesoría) + link de baja del canal. Best-effort por canal.
 */
async function notifyTriggered(alert: ActivePriceAlert, price: number, priceCurrency: string): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { getNotificationPrefs } = await import("@/lib/notifications/preferences");
  const { getActiveHouseholdId } = await import("@/lib/household/active");

  const prefs = await getNotificationPrefs(alert.userId, { db: admin, userId: alert.userId });

  const priceStr = formatMoney(price, priceCurrency);
  const targetStr = formatMoney(alert.targetPrice, alert.currency);
  const cmp = alert.direction === "above" ? "≥" : "≤";
  const verb = alert.direction === "above" ? "alcanzó" : "bajó a";
  const title = `${alert.symbol} ${verb} ${priceStr}`;
  const body = `${alert.symbol} ${verb} ${priceStr} (tu alerta: ${cmp} ${targetStr}). Es información, no una recomendación.`;

  // Campana in-app: related_kind queda null (el check de user_insights no admite 'holding');
  // la relación va por related_id = alert.id.
  if (prefs.inApp) {
    try {
      const household_id = await getActiveHouseholdId(admin, alert.userId);
      await admin.from("user_insights").insert({
        user_id: alert.userId,
        household_id,
        kind: "alerta_precio",
        severity: "info",
        title,
        body,
        related_id: alert.id,
        status: "activo",
      });
    } catch (err) {
      logger.error("price-alert: campana falló", { message: err instanceof Error ? err.message : "?" });
    }
  }

  // Email (si el canal está activo y hay proveedor + correo).
  if (prefs.email) {
    try {
      const { sendEmail, isEmailConfigured } = await import("@/lib/email/send");
      if (!isEmailConfigured()) return;
      const { data } = await admin.auth.admin.getUserById(alert.userId);
      const to = data.user?.email ?? null;
      if (!to) return;

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
      const secret = process.env.UNSUBSCRIBE_SECRET;
      let footer = "";
      if (baseUrl && secret) {
        const { signUnsubscribeToken } = await import("@/lib/notifications/unsubscribe-token");
        const token = signUnsubscribeToken(alert.userId, "email", secret);
        const url = `${baseUrl}/api/notifications/unsubscribe?token=${token}`;
        footer = `<p style="color:#888;font-size:12px;margin-top:16px">¿No querés estos correos? <a href="${url}">Darte de baja de las alertas por correo</a>.</p>`;
      }
      const html =
        `<p><strong>${escapeHtml(title)}</strong></p>` +
        `<p>${escapeHtml(alert.symbol)} ${verb} <strong>${escapeHtml(priceStr)}</strong> ` +
        `(tu alerta: ${cmp} <strong>${escapeHtml(targetStr)}</strong>).</p>` +
        `<p style="color:#666;font-size:12px">Es información, no una recomendación de inversión. ` +
        `El precio se revisa periódicamente, no en tiempo real.</p>` +
        `<p style="color:#888;font-size:12px">CARTERA+ · alerta de precio automática</p>` +
        footer;
      await sendEmail({ to, subject: title, html });
    } catch (err) {
      logger.error("price-alert: email falló", { message: err instanceof Error ? err.message : "?" });
    }
  }
}

async function handle(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");

    const { getActivePriceAlerts, markPriceAlertTriggered } = await import(
      "@/modules/wealth/services/price-alerts-service"
    );
    const { distinctSymbolFetches, selectTriggeredAlerts, priceKey } = await import(
      "@/modules/wealth/engine/price-alerts"
    );
    const { getMarketPrice } = await import("@/lib/market-data");

    const alerts = await getActivePriceAlerts();
    if (alerts.length === 0) {
      return NextResponse.json({ ok: true, alerts: 0, triggered: 0 }, { headers: cors });
    }

    // Un fetch por símbolo (dedup). Best-effort: un símbolo que falla no frena a los demás.
    const priceByKey = new Map<string, { price: number; currency: string }>();
    for (const f of distinctSymbolFetches(alerts)) {
      const marketType = MARKET_TYPE[f.assetType];
      if (!marketType) continue;
      try {
        const quote = await getMarketPrice(f.symbol, marketType);
        if (quote && quote.price > 0) {
          priceByKey.set(`${f.symbol}|${f.assetType}`, { price: quote.price, currency: quote.currency });
        }
      } catch (err) {
        logger.error("price-alert: precio falló", {
          symbol: f.symbol,
          message: err instanceof Error ? err.message : "?",
        });
      }
    }

    const nowIso = new Date().toISOString();
    let triggered = 0;
    for (const a of selectTriggeredAlerts(alerts, priceByKey)) {
      const quote = priceByKey.get(priceKey(a.symbol, a.assetType))!;
      try {
        await notifyTriggered(a, quote.price, quote.currency);
        await markPriceAlertTriggered(a.id, a.oneShot, nowIso);
        triggered += 1;
      } catch (err) {
        logger.error("price-alert: disparo falló", {
          alertId: a.id,
          message: err instanceof Error ? err.message : "?",
        });
      }
    }

    return NextResponse.json(
      { ok: true, alerts: alerts.length, symbols: priceByKey.size, triggered },
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
