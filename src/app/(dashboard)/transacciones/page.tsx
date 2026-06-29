import { loadBaseView } from "@/modules/financial-base/services/base-view";
import {
  listMyPendingProposals,
  type PendingProposalView,
} from "@/modules/financial-base/services/ingest-proposals-view";
import { BaseHeader } from "@/modules/financial-base/components/v2/base-header";
import { TransaccionesSection } from "@/modules/financial-base/components/v2/sections";
import { PorRevisarCard } from "@/modules/financial-base/components/v2/por-revisar-card";

/** Transacciones — ruta propia. Lee del mismo modelo V2 (transactions). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const view = await loadBaseView(sp.period);

  if (!view) {
    return (
      <div className="auth-msg warn" style={{ margin: 0 }}>
        Conecta Supabase para ver tus transacciones.
      </div>
    );
  }

  // Bandeja "Por revisar" (best-effort: si falla la lectura, no rompe la página).
  let proposals: PendingProposalView[] = [];
  try {
    proposals = await listMyPendingProposals();
  } catch {
    proposals = [];
  }

  return (
    <div className="grid">
      <BaseHeader
        title="Transacciones"
        sub="Todos tus movimientos del periodo."
        period={view.period}
      />
      <PorRevisarCard proposals={proposals} />
      <TransaccionesSection view={view} />
    </div>
  );
}
