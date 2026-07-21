import "server-only";

/**
 * Resumen "Gasto esencial mensual" con su desglose por origen — para que el
 * usuario VEA qué está sumando a su número de seguridad. Best-effort: si la
 * lectura falla (p.ej. la migración del flag aún no se aplicó), no renderiza.
 */
import { getEssentialMonthlyExpense } from "@/modules/wealth/services/essential-expense-service";
import { getDisplayCurrency } from "@/modules/financial-base";
import { formatMoney } from "@/lib/format";

export async function EssentialExpenseSummary() {
  let data: Awaited<ReturnType<typeof getEssentialMonthlyExpense>> | null = null;
  let currency = "CRC";
  try {
    [data, currency] = await Promise.all([getEssentialMonthlyExpense(), getDisplayCurrency()]);
  } catch {
    return null;
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
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
          {data.excludedPolicies.length === 1 ? "1 prima excluida" : `${data.excludedPolicies.length} primas excluidas`}: ya la
          pagás vía un ahorro esencial vinculado (no se cuenta dos veces).
        </div>
      ) : null}
    </div>
  );
}
