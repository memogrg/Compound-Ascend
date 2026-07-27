/**
 * GET/POST /api/investments/price-alerts — barrido de alertas de inversión. Cron.
 *
 * Evalúa los tres tipos con datos externos traídos UNA vez:
 *   · price     → getMarketPrice por símbolo distinto; cruza target/direction.
 *   · time_held → hoy − holding.purchaseDate ≥ years_threshold (purchaseDate se lee del
 *                 holding en cada corrida, robusto si la fecha cambia).
 *   · vesting   → hoy ≥ trigger_date.
 * Al cruzar: notifica por los canales activos (email + campana in-app, según preferencias),
 * marca triggered_at y desactiva si one_shot (no re-avisa). Best-effort por alerta.
 *
 * Acceso SOLO cron (patrón de /api/debts/reminders): X-Cron-Secret = CRON_SECRET o
 * Authorization: Bearer <CRON_SECRET>. Service-role (recorre todos los usuarios).
 * NO es tiempo real: tan oportuna como el cron (cadencia en vercel.json).
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { cronAuthorized } from "@/lib/security/cron-auth";
import { escapeHtml } from "@/lib/security/escape-html";
import { toSafeResponse, AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { logger } from "@/lib/logger";
import type { AssetType as MarketAssetType } from "@/lib/market-data";
import type { ActiveInvestmentAlert } from "@/modules/wealth/services/price-alerts-service";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  return cronAuthorized(
    { authorization: req.headers.get("authorization"), xCronSecret: req.headers.get("x-cron-secret") },
    process.env.CRON_SECRET,
  );
}

/** asset_type del holding → tipo de mercado de getMarketPrice. */
const MARKET_TYPE: Partial<Record<string, MarketAssetType>> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

type HoldingMeta = { label: string; purchaseDate: string | null };

/** Texto (título + cuerpo) de una alerta disparada, por tipo. Extensible: un case por kind. */
function alertCopy(
  alert: ActiveInvestmentAlert,
  price: number,
  priceCurrency: string,
  name: string,
): { title: string; body: string; detail: string } {
  if (alert.kind === "time_held") {
    const n = alert.yearsThreshold ?? 0;
    const yrs = `${n} ${n === 1 ? "año" : "años"}`;
    return {
      title: `${name} cumplió ${yrs} invertido`,
      body: `${name} cumplió ${yrs} invertido (tu alerta: ≥ ${yrs}). Es información, no una recomendación.`,
      detail: `Tu inversión <strong>${escapeHtml(name)}</strong> cumplió <strong>${escapeHtml(yrs)}</strong> desde la compra (tu alerta: ≥ ${escapeHtml(yrs)}).`,
    };
  }
  if (alert.kind === "vesting") {
    const d = alert.triggerDate ?? "";
    return {
      title: `Llegó la fecha de vesting de ${name}`,
      body: `Llegó la fecha de vesting de ${name} (${d}). Es información, no una recomendación.`,
      detail: `Llegó la fecha de vesting de <strong>${escapeHtml(name)}</strong> (<strong>${escapeHtml(d)}</strong>).`,
    };
  }
  // price (default)
  const priceStr = formatMoney(price, priceCurrency);
  const targetStr = formatMoney(alert.targetPrice ?? 0, alert.currency ?? priceCurrency);
  const cmp = alert.direction === "above" ? "≥" : "≤";
  const verb = alert.direction === "above" ? "alcanzó" : "bajó a";
  const sym = alert.symbol ?? name;
  return {
    title: `${sym} ${verb} ${priceStr}`,
    body: `${sym} ${verb} ${priceStr} (tu alerta: ${cmp} ${targetStr}). Es información, no una recomendación.`,
    detail: `${escapeHtml(sym)} ${verb} <strong>${escapeHtml(priceStr)}</strong> (tu alerta: ${cmp} <strong>${escapeHtml(targetStr)}</strong>).`,
  };
}

/**
 * Notifica una alerta disparada por los canales ACTIVOS del usuario (email + campana).
 * Respeta las preferencias. Copy con disclaimer (no es asesoría) + link de baja. Best-effort.
 */
async function notifyTriggered(
  alert: ActiveInvestmentAlert,
  price: number,
  priceCurrency: string,
  name: string,
): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { getNotificationPrefs } = await import("@/lib/notifications/preferences");
  const { getActiveHouseholdId } = await import("@/lib/household/active");

  const prefs = await getNotificationPrefs(alert.userId, { db: admin, userId: alert.userId });
  const { title, body, detail } = alertCopy(alert, price, priceCurrency, name);

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
      logger.error("investment-alert: campana falló", { message: err instanceof Error ? err.message : "?" });
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
        `<p>${detail}</p>` +
        `<p style="color:#666;font-size:12px">Es información, no una recomendación de inversión. ` +
        `Se revisa periódicamente, no en tiempo real.</p>` +
        `<p style="color:#888;font-size:12px">CARTERA+ · alerta de inversión automática</p>` +
        footer;
      await sendEmail({ to, subject: title, html });
    } catch (err) {
      logger.error("investment-alert: email falló", { message: err instanceof Error ? err.message : "?" });
    }
  }
}

async function handle(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");

    const { getActiveInvestmentAlerts, markInvestmentAlertTriggered } = await import(
      "@/modules/wealth/services/price-alerts-service"
    );
    const { distinctSymbolFetches, selectFiringAlerts, priceKey, kindsFromParam } = await import(
      "@/modules/wealth/engine/price-alerts"
    );
    const { getMarketPrice } = await import("@/lib/market-data");
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");

    // ?kinds=price → solo precio (única corrida que llama getMarketPrice); ?kinds=date →
    // time_held+vesting (sin llamadas de mercado); ausente/all → todas (retrocompatible).
    const kindsParam = new URL(req.url).searchParams.get("kinds");
    const kindFilter = kindsFromParam(kindsParam);

    const alerts = await getActiveInvestmentAlerts(kindFilter);
    if (alerts.length === 0) {
      return NextResponse.json({ ok: true, kinds: kindsParam ?? "all", alerts: 0, triggered: 0 }, { headers: cors });
    }

    // Precios: un fetch por símbolo distinto (solo alertas price). Best-effort por símbolo.
    const priceAlerts = alerts.filter(
      (a): a is ActiveInvestmentAlert & { symbol: string; assetType: string } =>
        a.kind === "price" && !!a.symbol && !!a.assetType,
    );
    const priceByKey = new Map<string, { price: number; currency: string }>();
    for (const f of distinctSymbolFetches(priceAlerts)) {
      const marketType = MARKET_TYPE[f.assetType];
      if (!marketType) continue;
      try {
        const quote = await getMarketPrice(f.symbol, marketType);
        if (quote && quote.price > 0) {
          priceByKey.set(priceKey(f.symbol, f.assetType), { price: quote.price, currency: quote.currency });
        }
      } catch (err) {
        logger.error("investment-alert: precio falló", {
          symbol: f.symbol,
          message: err instanceof Error ? err.message : "?",
        });
      }
    }

    // Holdings referenciados: label + purchaseDate (para time_held/vesting y el nombre en el copy).
    const holdingIds = [...new Set(alerts.map((a) => a.holdingId).filter((x): x is string => !!x))];
    const holdingMeta = new Map<string, HoldingMeta>();
    const purchaseDateByHolding = new Map<string, string | null>();
    if (holdingIds.length > 0) {
      const admin = createServiceRoleClient();
      const { data } = await admin
        .from("investment_holdings")
        .select("id, label, symbol, purchase_date")
        .in("id", holdingIds);
      for (const h of data ?? []) {
        holdingMeta.set(h.id, { label: h.label ?? h.symbol ?? "tu inversión", purchaseDate: h.purchase_date });
        purchaseDateByHolding.set(h.id, h.purchase_date);
      }
    }

    const nowIso = new Date().toISOString();
    let triggered = 0;
    for (const a of selectFiringAlerts(alerts, { nowIso, priceByKey, purchaseDateByHolding })) {
      const quote = a.symbol && a.assetType ? priceByKey.get(priceKey(a.symbol, a.assetType)) : undefined;
      const name = a.holdingId ? (holdingMeta.get(a.holdingId)?.label ?? a.symbol ?? "tu inversión") : (a.symbol ?? "tu inversión");
      try {
        await notifyTriggered(a, quote?.price ?? 0, quote?.currency ?? a.currency ?? "USD", name);
        await markInvestmentAlertTriggered(a.id, a.oneShot, nowIso);
        triggered += 1;
      } catch (err) {
        logger.error("investment-alert: disparo falló", {
          alertId: a.id,
          message: err instanceof Error ? err.message : "?",
        });
      }
    }

    return NextResponse.json(
      { ok: true, kinds: kindsParam ?? "all", alerts: alerts.length, symbols: priceByKey.size, triggered },
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
