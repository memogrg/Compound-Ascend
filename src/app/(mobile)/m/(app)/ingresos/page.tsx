import { MobileHeader } from "../../components/mobile-header";
import { loadBaseView } from "@/modules/financial-base/services/base-view";
import type { BudgetItem } from "@/modules/financial-base/types";
import { convertCurrency } from "@/lib/fx";
import { formatMoney, formatPercent } from "@/lib/format";
import { IncomeManager } from "./income-manager";

/**
 * /m/ingresos — paridad con la web /ingresos (sistema V2). Las FUENTES son líneas
 * budget_items (income) y lo real son movimientos (transactions). Reutiliza EXACTAMENTE
 * la orquestación de la web (loadBaseView) + las mismas Server Actions V2 (vía
 * IncomeManager: register/update/deleteIncomeSourceAction + receivePartialIncomeAction).
 * Así lo capturado en móvil SÍ aparece en la web (misma tabla). es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

/** Fuente vinculada a inversiones (renta/dividendos) → read-only, como la web. */
function isLinked(b: BudgetItem): boolean {
  return Boolean(b.holdingId) || b.sourceKind === "dividend" || b.sourceKind === "rental";
}

export default async function MobileIngresos() {
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          <MobileHeader variant="inner" eyebrow="Presupuesto" title="Ingresos" backHref="/m" backLabel="Volver a Inicio" />
          <div className="card card-p">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Conecta Supabase para gestionar tus ingresos.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { currency, budget, real, rates, incomeTree } = view;
  const incomeItems = budget.items.filter((b) => b.type === "income");
  const manualSources = incomeItems.filter((b) => (b.sourceKind ?? "manual") === "manual" && !isLinked(b));
  const linkedSources = incomeItems.filter(isLinked);
  const receivedNative = real.incomeReceivedBySourceNative;

  // Agregados en la moneda de display (misma lógica que IncomeSection en la web).
  const conv = (b: BudgetItem) => convertCurrency(b.amount, b.currency, currency, rates);
  const receivedOf = (b: BudgetItem) => real.incomeReceivedBySource[b.id] ?? 0;
  const linkedValueOf = (b: BudgetItem) => {
    const r = receivedOf(b);
    return r > 0 ? r : conv(b);
  };
  const budgetIncome =
    manualSources.reduce((s, b) => s + conv(b), 0) + linkedSources.reduce((s, b) => s + conv(b), 0);
  const realIncome =
    manualSources.reduce((s, b) => s + receivedOf(b), 0) +
    linkedSources.reduce((s, b) => s + linkedValueOf(b), 0);
  const diff = realIncome - budgetIncome;
  const complPct = budgetIncome > 0 ? realIncome / budgetIncome : 0;
  const totalSources = manualSources.length + linkedSources.length;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" eyebrow="Presupuesto" title="Ingresos" backHref="/m" backLabel="Volver a Inicio" />

        {/* Hero: recibido vs planificado del mes */}
        <div className="card card-p" style={{ marginBottom: 14 }}>
          <span className="ov">Ingresos del mes · {view.period.label}</span>
          <div className="display" style={{ fontSize: 32, marginTop: 8 }}>
            {formatMoney(realIncome, currency)}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Recibido de {formatMoney(budgetIncome, currency)} planificados · {totalSources}{" "}
            {totalSources === 1 ? "fuente" : "fuentes"}
          </div>
          <div className="bar" style={{ height: 8, marginTop: 10 }}>
            <i style={{ width: `${Math.min(100, Math.round(complPct * 100))}%`, background: "var(--accent)" }} />
          </div>
        </div>

        {/* Métricas clave (paridad con la web) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <Metric label="Planificado" value={formatMoney(budgetIncome, currency)} sub="del mes" />
          <Metric
            label="Diferencia"
            value={`${diff >= 0 ? "+" : ""}${formatMoney(diff, currency)}`}
            sub="real − planificado"
            cls={diff >= 0 ? "pos" : "neg"}
          />
          <Metric label="% cumplimiento" value={formatPercent(complPct)} sub="de lo planificado" />
          <Metric label="Fuentes" value={String(totalSources)} sub="este mes" />
        </div>

        {/* Fuentes gestionables (V2: budget_items + movimiento real "Recibido") */}
        <div className="between" style={{ marginBottom: 6 }}>
          <div className="sec-title">Tus fuentes</div>
          {manualSources.length > 0 && (
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
              {manualSources.length} {manualSources.length === 1 ? "fuente" : "fuentes"}
            </span>
          )}
        </div>
        <IncomeManager
          sources={manualSources}
          received={receivedNative}
          currency={currency}
          incomeTree={incomeTree}
          periodMonth={view.period.month}
          periodYear={view.period.year}
        />

        {/* Ingresos vinculados a inversiones (renta/dividendos) — read-only, como la web */}
        {linkedSources.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <div className="sec-title" style={{ marginBottom: 6 }}>
              Vinculados a inversiones
            </div>
            <div className="card">
              {linkedSources.map((b) => {
                const rec = receivedNative[b.id] ?? 0;
                return (
                  <div key={b.id} className="between" style={{ padding: "12px 18px", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {b.sourceKind === "dividend" ? "Dividendos" : b.sourceKind === "rental" ? "Renta" : "Inversión"}
                        {" · gestiónalo en Patrimonio"}
                      </div>
                    </div>
                    <div className="mono pos" style={{ fontSize: 13.5, fontWeight: 700, flex: "none" }}>
                      {formatMoney(rec > 0 ? rec : b.amount, b.currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="card card-p" style={{ padding: 14 }}>
      <div className="ov">{label}</div>
      <div
        className={`mono ${cls ?? ""}`}
        style={{ fontSize: "clamp(14px, 4.6vw, 18px)", fontWeight: 700, marginTop: 6, whiteSpace: "nowrap" }}
      >
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

