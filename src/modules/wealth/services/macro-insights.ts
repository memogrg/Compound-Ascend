import "server-only";

/**
 * Integraciones informativas macro → usuario (todo en español, nada ejecuta
 * acciones):
 *  - Inflación → rendimiento real: ROI nominal del portafolio menos inflación.
 *  - TBP → deudas: nota si el usuario tiene crédito/hipoteca.
 *
 * Lee la inflación/TBP de la lib de indicadores y los datos del usuario de los
 * servicios existentes. Resiliente: si una fuente falla, omite esa nota.
 */
import { getYoYInflation, getTbpContext } from "@/lib/economic-indicators";
import { listDebts } from "@/modules/control";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";

export type InsightTone = "info" | "pos" | "neg" | "warn";
export interface MacroInsight {
  id: string;
  title: string;
  body: string;
  tone: InsightTone;
}

/** CPI de referencia por moneda (el de Costa Rica se añadirá con el token BCCR). */
const CPI_BY_CURRENCY: Record<string, string> = {
  USD: "US_CPI",
};

/** Porcentaje con 2 decimales y signo opcional. */
function pct(value: number, signed = false): string {
  const s = signed && value >= 0 ? "+" : value < 0 ? "−" : "";
  return `${s}${Math.abs(value).toFixed(2)}%`;
}

export async function getMacroInsights(): Promise<MacroInsight[]> {
  const out: MacroInsight[] = [];

  // ── Inflación → rendimiento real ────────────────────────────────
  // Referencia: inflación de EE. UU. (US_CPI), disponible hoy. Cuando exista el
  // IPC de Costa Rica se usará el de la moneda del portafolio.
  const usInflation = await getYoYInflation("US_CPI").catch(() => null);
  let report: Awaited<ReturnType<typeof getPortfolioReport>> | null = null;
  try {
    report = await getPortfolioReport();
  } catch {
    report = null;
  }

  if (usInflation !== null) {
    const inflPct = usInflation * 100;
    const cpiForCurrency = report ? CPI_BY_CURRENCY[report.currency] : undefined;
    const sameCurrency = cpiForCurrency === "US_CPI";

    if (report && report.analytics.totalCostBasis > 0) {
      const nominal = report.analytics.totalReturnPct * 100;
      const real = nominal - inflPct;
      const ref = sameCurrency
        ? `la inflación de EE. UU. (${pct(inflPct)})`
        : `la inflación de EE. UU. como referencia (${pct(inflPct)})`;
      out.push({
        id: "real-return",
        title: "Rendimiento real de tu portafolio",
        body:
          `Tu rendimiento nominal es ${pct(nominal, true)}. Descontando ${ref}, ` +
          `tu rendimiento real estimado es ${pct(real, true)}. ` +
          `Una inversión solo gana poder adquisitivo si supera la inflación.`,
        tone: real >= 0 ? "pos" : "neg",
      });
    } else {
      out.push({
        id: "inflation-ref",
        title: "Inflación de referencia (EE. UU.)",
        body:
          `La inflación interanual de EE. UU. es ${pct(inflPct)}. ` +
          `Tus inversiones deben rendir por encima de ese nivel para ganar poder adquisitivo.`,
        tone: "info",
      });
    }
  }

  // ── TBP → deudas ────────────────────────────────────────────────
  const tbp = await getTbpContext().catch(() => null);
  if (tbp) {
    let hasDebt = false;
    let hasCrcDebt = false;
    try {
      const active = (await listDebts()).filter((d) => d.balance > 0);
      hasDebt = active.length > 0;
      hasCrcDebt = active.some((d) => d.currency === "CRC");
    } catch {
      /* sin deudas accesibles: omite la nota */
    }
    if (hasDebt) {
      const move =
        tbp.change6mAbs === null
          ? ""
          : ` La TBP ${tbp.change6mAbs >= 0 ? "subió" : "bajó"} ` +
            `${Math.abs(tbp.change6mAbs).toFixed(2)} pp en los últimos 6 meses.`;
      const tail = hasCrcDebt
        ? " Si tu crédito o hipoteca en colones es a tasa variable, tus cuotas podrían ajustarse en las próximas revisiones."
        : " Las tasas variables en colones suelen referenciarse a la TBP.";
      out.push({
        id: "tbp-debt",
        title: "Tasa Básica Pasiva y tus deudas",
        body: `La TBP está en ${pct(tbp.valuePct)}.${move}${tail}`,
        tone: (tbp.change6mAbs ?? 0) > 0 ? "warn" : "info",
      });
    }
  }

  return out;
}
