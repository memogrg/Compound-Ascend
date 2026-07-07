import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { formatMoney } from "@/lib/format";

import { MobileTxnList } from "./mobile-txn-list";

/**
 * /m/transacciones — paridad con la web /transacciones ("Transacciones", nombre exacto
 * de nav.ts) y data-screen="transacciones" del diseño. Franja de resumen + lista con
 * filtro. Reutiliza la MISMA orquestación (loadBaseView: transacciones + totales +
 * nombres de categoría), sin reimplementar consultas. es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

export default async function MobileTransacciones() {
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          <div className="card card-p">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Aún no puedes ver tus transacciones. Registra un movimiento para empezar.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { real, currency, transactions, categoryNames, period } = view;
  const net = real.freeCashflowReal;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div style={{ marginBottom: 16 }}>
          <div className="ov">Movimientos · {period.label}</div>
          <div className="h-title" style={{ marginTop: 6 }}>
            Transacciones
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Todos tus movimientos del periodo.
          </div>
        </div>

        {/* Franja de resumen (misma que la web: saldo neto, ingresos, gastos, movimientos) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Sum label="Saldo neto" value={`${net >= 0 ? "+" : "−"}${formatMoney(Math.abs(net), currency)}`} cls={net >= 0 ? "pos" : "neg"} sub="del periodo" />
          <Sum label="Movimientos" value={String(real.count)} sub={`${formatMoney(real.avgDaily, currency)}/día`} />
          <Sum label="Ingresos" value={formatMoney(real.realIncome, currency)} cls="pos" sub="este mes" />
          <Sum label="Gastos" value={formatMoney(real.realExpense, currency)} cls="neg" sub="este mes" />
        </div>

        <MobileTxnList
          transactions={transactions}
          categoryNames={categoryNames}
          currency={currency}
          periodLabel={period.label}
        />
      </div>
    </div>
  );
}

function Sum({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="card card-p" style={{ padding: 14 }}>
      <div className="ov">{label}</div>
      <div className={`mono ${cls ?? ""}`} style={{ fontSize: 17, fontWeight: 700, marginTop: 6 }}>
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
