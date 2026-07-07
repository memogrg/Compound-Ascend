import Link from "next/link";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base";
import { formatMoney } from "@/lib/format";

/**
 * /m/ingresos — "Ingresos": ingreso mensual + fuentes. Reutiliza el barrel
 * financial-base (getBaseSummary: indicators.incomeMonthly + incomes[]). Sin
 * reimplementar cálculos. Piel del diseño (data-screen="ingresos"), es-MX "tú",
 * tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const TYPE_LABEL: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  extraordinario: "Extraordinario",
};

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
            <div className="ov">Base</div>
            <div className="h-title" style={{ marginTop: 2 }}>
              Ingresos
            </div>
          </div>
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
          <div className="card card-p">
            {sources.length === 0 ? (
              <div className="muted" style={{ padding: "12px 0", fontSize: 13.5, lineHeight: 1.5 }}>
                Aún no registras fuentes de ingreso. Agrégalas para ver tu ingreso mensual real.
              </div>
            ) : (
              sources.map((s) => {
                const passive = s.incomeType === "pasivo";
                return (
                  <div className="lrow" key={s.id}>
                    <span
                      className="lic"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                      aria-hidden
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                        {passive ? (
                          <>
                            <path d="M4 11l8-6 8 6" />
                            <path d="M6 10v9h12v-9" />
                          </>
                        ) : (
                          <>
                            <rect x="2" y="7" width="20" height="14" rx="2" />
                            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </>
                        )}
                      </svg>
                    </span>
                    <div>
                      <div className="lname">{s.name}</div>
                      <div className="lsub">
                        <span className="schip">{s.frequency.toUpperCase()}</span> ·{" "}
                        {TYPE_LABEL[s.incomeType] ?? s.incomeType}
                      </div>
                    </div>
                    <div className="lamt pos">+{formatMoney(s.amountMonthly, s.currency)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
