import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { computeV2Totals } from "@/modules/financial-base/engine/base-v2";
import type { FinancialPressure } from "@/modules/financial-base/types";
import { formatMoney, formatPercent } from "@/lib/format";
import { MobileHeader } from "../../components/mobile-header";
import { LiquidityManager } from "./liquidity-manager";

/**
 * /m/mi-base-financiera — paridad con la web /mi-base-financiera ("Mi Base Financiera",
 * nombre exacto de nav.ts). Vista general: presupuesto vs real del mes + lectura.
 * Reutiliza la MISMA orquestación de la web (loadBaseView) y el engine (computeV2Totals),
 * sin reimplementar cálculos. es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const PRESSURE: Record<FinancialPressure, { label: string; cls: string }> = {
  baja: { label: "Baja", cls: "pos" },
  media: { label: "Media", cls: "warn" },
  alta: { label: "Alta", cls: "warn" },
  critica: { label: "Crítica", cls: "neg" },
};

/** Varianza con signo (+/-) formateada como %. */
function variance(pct: number): { text: string; cls: string } {
  const abs = formatPercent(Math.abs(pct));
  if (pct > 0.001) return { text: `+${abs}`, cls: "pos" };
  if (pct < -0.001) return { text: `−${abs}`, cls: "neg" };
  return { text: abs, cls: "muted" };
}

export default async function MobileMiBase() {
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          <div className="card card-p">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Aún no puedes ver tu Base Financiera. Captura tus ingresos y gastos para ver
              presupuesto vs real del mes.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { currency, budget, real, liquidity, baseReading, financialPressure, period } = view;
  const t = computeV2Totals({
    budgetIncome: budget.budgetIncome,
    realIncome: real.realIncome,
    budgetExpense: budget.budgetExpense,
    realExpense: real.realExpense,
  });
  const incVar = variance(t.incomeVariancePct);
  const expVar = variance(t.expenseVariancePct);
  const pressure = PRESSURE[financialPressure];

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" eyebrow={`Presupuesto · ${period.label}`} title="Mi Base Financiera" />
        <div className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 14 }}>
          Tu centro operativo: presupuesto vs real del mes.
        </div>

        {/* Liquidez (gestionable: fijar saldo inicial / ajustar saldo) */}
        <LiquidityManager
          balance={liquidity.balance}
          currency={liquidity.currency}
          hasOpening={liquidity.hasOpening}
        />

        {/* Presupuesto vs real */}
        <div className="card card-p" style={{ marginBottom: 14 }}>
          <BudgetRow
            label="Ingresos"
            budget={formatMoney(budget.budgetIncome, currency)}
            real={formatMoney(real.realIncome, currency)}
            variance={incVar}
          />
          <div style={{ height: 1, background: "var(--border)", margin: "12px 0" }} />
          <BudgetRow
            label="Gastos"
            budget={formatMoney(budget.budgetExpense, currency)}
            real={formatMoney(real.realExpense, currency)}
            variance={expVar}
          />
        </div>

        {/* Métricas clave */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Metric
            label="Flujo libre real"
            value={formatMoney(t.freeCashflowReal, currency)}
            sub={`${formatPercent(t.freeCashflowPct)} del ingreso`}
            cls={t.freeCashflowReal >= 0 ? "pos" : "neg"}
          />
          <Metric label="Gasto / ingreso" value={formatPercent(t.expenseRatio)} sub="ratio del mes" />
          <Metric label="Presión financiera" value={pressure.label} cls={pressure.cls} sub="del mes" />
          <Metric label="Movimientos" value={String(real.count)} sub={`${formatMoney(real.avgDaily, currency)}/día`} />
        </div>

        {/* Lectura (misma que la web: título + diagnóstico + insights + acciones + próximo paso) */}
        {baseReading ? (
          <div className="card card-p">
            <div className="ov" style={{ marginBottom: 6 }}>
              {baseReading.title}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>{baseReading.diagnosis}</div>
            {baseReading.insights.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <div className="ov" style={{ marginBottom: 6 }}>
                  Insights
                </div>
                <ReadingList items={baseReading.insights} />
              </div>
            ) : null}
            {baseReading.actions.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <div className="ov" style={{ marginBottom: 6 }}>
                  Acciones
                </div>
                <ReadingList items={baseReading.actions} accent />
              </div>
            ) : null}
            {baseReading.nextStep ? (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <span className="muted">Próximo paso: </span>
                {baseReading.nextStep}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BudgetRow({
  label,
  budget,
  real,
  variance,
}: {
  label: string;
  budget: string;
  real: string;
  variance: { text: string; cls: string };
}) {
  return (
    <div className="between">
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          Presupuesto {budget}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
          {real}
        </div>
        <div className={variance.cls} style={{ fontSize: 11.5, marginTop: 2, fontWeight: 600 }}>
          {variance.text} vs plan
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  cls,
}: {
  label: string;
  value: string;
  sub?: string;
  cls?: string;
}) {
  return (
    <div className="card card-p" style={{ padding: 14 }}>
      <div className="ov">{label}</div>
      <div className={`mono ${cls ?? ""}`} style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
        {value}
      </div>
      {sub ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function ReadingList({ items, accent }: { items: string[]; accent?: boolean }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} className="row" style={{ alignItems: "flex-start", gap: 8, fontSize: 13, lineHeight: 1.45 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              marginTop: 6,
              flex: "none",
              background: accent ? "var(--accent)" : "var(--text-dim)",
            }}
            aria-hidden
          />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
