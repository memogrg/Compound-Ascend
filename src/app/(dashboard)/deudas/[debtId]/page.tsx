import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getDebtDetail } from "@/modules/control/services/debt-detail-service";
import { getIndexRates } from "@/modules/control/services/index-rates";
import { DebtDetail } from "@/modules/control/components/debt-detail";
import { Icon } from "@/components/ui/icon";

/**
 * Detalle de una deuda: amortización, gráfica de saldo, reportar pago y
 * calculadora de escenarios.
 */
export default async function Page({ params }: { params: Promise<{ debtId: string }> }) {
  const { debtId } = await params;
  if (!isSupabaseConfigured()) {
    return (
      <div className="auth-msg warn" style={{ margin: 0 }}>
        Conecta Supabase para ver el detalle de tus deudas.
      </div>
    );
  }
  const vm = await getDebtDetail(debtId, await getIndexRates());
  if (!vm) notFound();

  return (
    <div className="grid">
      <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="card-title">Detalle de deuda</div>
          <div className="card-sub">Calculadora de amortización y pago.</div>
        </div>
        <Link className="btn btn-secondary" href="/deudas">
          <Icon name="chev" width={2} /> Volver a deudas
        </Link>
      </div>
      <DebtDetail vm={vm} />
    </div>
  );
}
