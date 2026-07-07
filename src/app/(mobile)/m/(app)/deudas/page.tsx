import Link from "next/link";
import {
  getDebtsOverview,
  getIndexRates,
  simulateStrategy,
  orderDebts,
  recommendMethod,
  type DebtVM,
} from "@/modules/control";
import type { DebtInput } from "@/modules/control/engine/debt-strategy";
import { formatMoney, formatPercent } from "@/lib/format";

/**
 * /m/deudas — "Libérate": deuda total, estrategia de pago (avalancha/bola de
 * nieve), próximo pago y lista ordenada. Reutiliza el barrel control
 * (getDebtsOverview + engine simulateStrategy/orderDebts/recommendMethod). Sin
 * reimplementar cálculos. Piel del diseño (data-screen="deudas"), es-MX "tú",
 * tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const METHOD_LABEL: Record<string, string> = {
  avalancha: "Avalancha",
  bola_nieve: "Bola de nieve",
  hibrido: "Híbrido",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

export default async function MobileDeudas() {
  const rates = await getIndexRates();
  const ov = await getDebtsOverview(rates);
  const { currency, debts, freeCashflow } = ov;

  const total = debts.reduce((s, d) => s + d.balance, 0);
  const inputs: DebtInput[] = debts.map((d) => ({
    id: d.id,
    name: d.name,
    balance: d.balance,
    apr: d.apr,
    minPayment: d.minPayment,
  }));
  const extra = Math.max(0, freeCashflow);
  const rec = recommendMethod(inputs);
  const aval = simulateStrategy(inputs, "avalancha", extra);
  const snow = simulateStrategy(inputs, "bola_nieve", extra);
  const saving = Math.max(0, snow.totalInterest - aval.totalInterest); // avalancha ahorra intereses

  const sim = simulateStrategy(inputs, rec.method, extra);
  const monthsById = new Map(sim.payoffOrder.map((p) => [p.id, p.monthPaid]));
  const orderedIds = orderDebts(inputs, rec.method).map((d) => d.id);
  const ordered: DebtVM[] = orderedIds
    .map((id) => debts.find((d) => d.id === id))
    .filter((d): d is DebtVM => Boolean(d));
  const next = ordered[0];

  if (debts.length === 0) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          <Header />
          <div className="card card-p" style={{ marginTop: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Sin deudas registradas 🎉</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
              No tienes deudas cargadas. Si tienes alguna, agrégala para armar tu plan de pago.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <Header />

        {/* Hero: deuda total */}
        <div
          className="hero-nw"
          style={{
            marginBottom: 16,
            background: "linear-gradient(155deg, color-mix(in srgb, var(--danger) 16%, var(--surface)), var(--surface) 62%)",
            borderColor: "color-mix(in srgb, var(--danger) 22%, var(--border))",
          }}
        >
          <div className="ov">Deuda total</div>
          <div className="hero-amt" style={{ color: "var(--danger)", marginTop: 6 }}>
            {formatMoney(total, currency)}
          </div>
          <div className="delta" style={{ marginTop: 8, color: "var(--text-muted)" }}>
            {debts.length} {debts.length === 1 ? "deuda activa" : "deudas activas"}
          </div>
        </div>

        {/* Estrategia de pago */}
        <div style={{ marginBottom: 16 }}>
          <div className="ov" style={{ marginBottom: 10 }}>
            Estrategia de pago
          </div>
          <div className="row" style={{ gap: 10, alignItems: "stretch" }}>
            <div className={`mcard${rec.method === "avalancha" ? " sel" : ""}`}>
              <div className="mt">Avalancha</div>
              <div className="md">Ataca la tasa más alta primero</div>
              <div className="mm">{saving > 0 ? `Ahorra ${formatMoney(saving, currency)}` : "Menos intereses"}</div>
            </div>
            <div className={`mcard${rec.method === "bola_nieve" ? " sel" : ""}`}>
              <div className="mt">Bola de nieve</div>
              <div className="md">Liquida la más pequeña primero</div>
              <div className="mm">Más motivación</div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>
            Recomendado para ti: <strong>{METHOD_LABEL[rec.method] ?? rec.method}</strong>. {rec.reason}
          </div>
        </div>

        {/* Próximo pago */}
        {next && (
          <div
            className="card card-p"
            style={{ marginBottom: 16, background: "var(--accent-soft)", borderColor: "transparent" }}
          >
            <div className="between">
              <div>
                <div className="ov" style={{ color: "var(--accent)" }}>
                  Próximo pago
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6 }}>{next.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Vence {fmtDate(next.nextDue)}
                </div>
              </div>
              <div className="display" style={{ fontSize: 22 }}>
                {formatMoney(next.monthlyPayment || next.minPayment, next.currency)}
              </div>
            </div>
          </div>
        )}

        {/* Lista de deudas */}
        <div>
          <div className="between" style={{ marginBottom: 6 }}>
            <div className="sec-title">Tus deudas</div>
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
              orden · {METHOD_LABEL[rec.method]?.toLowerCase() ?? rec.method}
            </span>
          </div>
          {ordered.map((d, i) => {
            const pct = d.originalAmount && d.originalAmount > 0 ? Math.min(1, d.balance / d.originalAmount) : 1;
            const cuota = d.monthlyPayment || d.minPayment;
            const months = monthsById.get(d.id);
            const barColor = i === 0 ? "var(--danger)" : "var(--warning)";
            return (
              <div className="card card-p" style={{ marginBottom: 12 }} key={d.id}>
                <div className="between" style={{ marginBottom: 12 }}>
                  <div className="row" style={{ gap: 11 }}>
                    <span
                      className="lic"
                      style={i === 0 ? { background: "var(--danger-soft)", color: "var(--danger)" } : undefined}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <div className="lname">{d.name}</div>
                      <div className="lsub">
                        {d.debtType ?? "Deuda"} · {formatPercent(d.apr / 100, 1)}
                      </div>
                    </div>
                  </div>
                  <div className="jar-amt">
                    <div className="a neg">{formatMoney(d.balance, d.currency)}</div>
                    {d.originalAmount ? <div className="b">de {formatMoney(d.originalAmount, d.currency)}</div> : null}
                  </div>
                </div>
                <div className="bar" style={{ height: 7 }}>
                  <i style={{ width: `${Math.round(pct * 100)}%`, background: barColor }} />
                </div>
                <div className="between" style={{ marginTop: 9 }}>
                  <span className="muted" style={{ fontSize: 11 }}>
                    Cuota {formatMoney(cuota, d.currency)}/mes
                  </span>
                  {months != null && (
                    <span className="mono" style={{ fontSize: 11 }}>
                      ≈ {months} {months === 1 ? "mes" : "meses"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="hdr" style={{ marginBottom: 16 }}>
      <Link href="/m" className="bk" aria-label="Volver a Inicio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </Link>
      <div style={{ flex: 1 }}>
        <div className="ov">Libérate</div>
        <div className="h-title" style={{ marginTop: 2 }}>
          Deudas
        </div>
      </div>
    </div>
  );
}
