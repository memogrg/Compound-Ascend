import "server-only";

/**
 * Arma el ToolContext de la herramienta de deuda para el chat de WhatsApp. El
 * webhook NO tiene sesión, así que se lee con SERVICE-ROLE para `userId` y la
 * moneda es la PRINCIPAL (user_settings.primary_currency), nunca la de
 * visualización; las deudas se normalizan a esa moneda con FX (misma disciplina
 * que el chat web). Solo lectura.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getUserCurrency } from "@/lib/whatsapp/links-service";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { getPatrimonioReportForUser } from "@/modules/wealth/services/patrimonio-service";
import { convertCurrency } from "@/lib/fx";
import { normalizeDebtsForTool, type ToolContext } from "@/lib/ai/orchestrator";

type DebtRow = {
  id: string;
  name: string;
  balance: number | string;
  apr: number | string | null;
  min_payment: number | string | null;
  currency: string;
};

/**
 * Lee las deudas activas de `userId` (service-role) + su moneda principal, obtiene
 * las tasas FX y devuelve el ToolContext normalizado a la principal. `householdId`
 * se acepta para simetría con el chat web; hoy las deudas se leen por usuario
 * (igual que listDebts en sesión).
 */
export async function buildWhatsAppToolContext(
  userId: string,
  _householdId: string | null,
): Promise<ToolContext> {
  const supabase = createServiceRoleClient();
  const [debtsRes, primary] = await Promise.all([
    supabase.from("debts").select("id, name, balance, apr, min_payment, currency").eq("user_id", userId),
    getUserCurrency(userId), // service-role: user_settings.primary_currency (default CRC)
  ]);

  const raw = ((debtsRes.data ?? []) as DebtRow[])
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: Number(d.balance),
      minPayment: Number(d.min_payment ?? 0),
      apr: d.apr === null ? null : Number(d.apr),
      currency: d.currency,
    }))
    .filter((d) => d.balance > 0);

  let rates: Record<string, number> | null = null;
  try {
    rates = await getFxRates();
  } catch {
    rates = null;
  }

  const toolContext: ToolContext = {
    currency: primary,
    fxUnavailable: !rates,
    debts: normalizeDebtsForTool(raw, primary, rates),
  };

  // Número de Libertad + patrimonio invertible (service-role, ya en moneda primaria).
  // Best-effort: si falla, la tool de libertad degrada con un motivo explicable.
  try {
    const pat = await getPatrimonioReportForUser(userId);
    let numero = pat.report.numeroDeLibertad;
    let invertible = pat.report.investableWealth;
    if (pat.currency !== primary) {
      if (rates) {
        numero = convertCurrency(numero, pat.currency, primary, rates);
        invertible = convertCurrency(invertible, pat.currency, primary, rates);
      } else {
        numero = NaN;
      }
    }
    if (Number.isFinite(numero)) {
      toolContext.freedomNumber = numero;
      toolContext.investableWealth = invertible;
    }
  } catch {
    // deja los campos undefined
  }

  return toolContext;
}
