import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { BaseHeader } from "@/modules/financial-base/components/v2/base-header";
import { TransaccionesSection } from "@/modules/financial-base/components/v2/sections";

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

  return (
    <div className="grid">
      <BaseHeader title="Transacciones" sub="Todos tus movimientos del periodo." period={view.period} />
      <TransaccionesSection view={view} />
    </div>
  );
}
