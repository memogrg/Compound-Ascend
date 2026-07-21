import "server-only";

/**
 * Resumen "Gasto esencial mensual" con su desglose por origen — para que el
 * usuario VEA qué está sumando a su número de seguridad. Best-effort: si la
 * lectura falla (p.ej. la migración del flag aún no se aplicó), no renderiza.
 *
 * Acepta el breakdown ya calculado (fuente única desde el marco patrimonial) para
 * no volver a leerlo; si no se pasa, lo busca por su cuenta (uso en /gastos).
 */
import { getEssentialMonthlyExpense } from "@/modules/wealth/services/essential-expense-service";
import { getDisplayCurrency } from "@/modules/financial-base";
import type { EssentialBreakdown } from "@/modules/wealth/engine/essential-expense";
import { formatMoney } from "@/lib/format";

export async function EssentialExpenseSummary({
  data: dataProp,
  currency: currencyProp,
}: {
  data?: EssentialBreakdown | null;
  currency?: string;
} = {}) {
  let data: EssentialBreakdown | null = dataProp ?? null;
  let currency = currencyProp ?? "CRC";
  // Sin data por props → lo leemos (best-effort). Con data (aunque sea null) no releemos.
  if (dataProp === undefined) {
    try {
      [data, currency] = await Promise.all([getEssentialMonthlyExpense(), getDisplayCurrency()]);
    } catch {
      return null;
    }
  }
  if (!data || data.total <= 0) return null;

  const rows: { label: string; value: number }[] = [
    { label: "Sobres", value: data.byOrigin.sobres },
    { label: "Deudas", value: data.byOrigin.debts },
    { label: "Ahorros esenciales", value: data.byOrigin.goals },
    { label: "Pólizas", value: data.byOrigin.policies },
  ].filter((r) => r.value > 0);

  return (
    <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="label">
          Gasto esencial mensual{" "}
          <span
            className="tip"
            data-tip="Suma de lo que marcaste esencial (sobres, deudas, ahorros ineludibles y pólizas). Es la base de tu número de seguridad: el capital que, al 8%, ya lo cubre."
            style={{ color: "var(--muted)", cursor: "help" }}
          >
            ⓘ
          </span>
        </span>
        <span className="num-lg" style={{ fontWeight: 700 }}>
          {formatMoney(data.total, currency)}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        {rows.map((r) => (
          <span key={r.label} className="muted" style={{ fontSize: 12 }}>
            {r.label}: <strong className="tnum">{formatMoney(r.value, currency)}</strong>
          </span>
        ))}
      </div>
      {data.excludedPolicies.length > 0 ? (
        <ul
          className="muted"
          style={{ fontSize: 11.5, margin: "8px 0 0", paddingLeft: 16, lineHeight: 1.5, display: "grid", gap: 3 }}
        >
          {data.excludedPolicies.map((p) => (
            <li key={p.id}>
              Prima de <strong>{p.policyName}</strong> ({formatMoney(p.monthly, currency)}) excluida:
              ya la pagás vía el ahorro <strong>{p.viaGoalName}</strong> (no se cuenta dos veces).
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
