import Link from "next/link";
import { MobileMenu } from "../../components/mobile-menu";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base";
import { formatMoney } from "@/lib/format";
import { IncomeManager } from "./income-manager";

/**
 * /m/ingresos — "Ingresos": ingreso mensual + fuentes. Reutiliza el barrel
 * financial-base (getBaseSummary: indicators.incomeMonthly + incomes[]). Sin
 * reimplementar cálculos. Piel del diseño (data-screen="ingresos"), es-MX "tú",
 * tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

export default async function MobileIngresos() {
  const [summary, currency] = await Promise.all([getBaseSummary(), getDisplayCurrency()]);
  const monthly = summary.indicators.incomeMonthly;
  const sources = summary.incomes;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div className="hdr" style={{ marginBottom: 16 }}>
          <Link href="/m" className="bk" aria-label="Volver a Inicio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <div style={{ flex: 1 }}>
            <div className="ov">Presupuesto</div>
            <div className="h-title" style={{ marginTop: 2 }}>
              Ingresos
            </div>
          </div>
          <MobileMenu />
        </div>

        {/* Hero: ingreso mensual */}
        <div className="card card-p" style={{ marginBottom: 16 }}>
          <span className="ov">Ingreso mensual</span>
          <div className="display" style={{ fontSize: 34, marginTop: 8 }}>
            {formatMoney(monthly, currency)}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Suma de tus fuentes, normalizada a mensual.
          </div>
        </div>

        {/* Fuentes de ingreso */}
        <div>
          <div className="between" style={{ marginBottom: 6 }}>
            <div className="sec-title">Fuentes de ingreso</div>
            {sources.length > 0 && (
              <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {sources.length} {sources.length === 1 ? "fuente" : "fuentes"}
              </span>
            )}
          </div>
          {/* Lista gestionable: cada fuente en SwipeRow (Editar/Eliminar) + FAB de alta */}
          <IncomeManager sources={sources} currency={currency} />
        </div>
      </div>
    </div>
  );
}
