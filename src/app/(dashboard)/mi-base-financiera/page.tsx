import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { BaseHeader } from "@/modules/financial-base/components/v2/base-header";
import { MiBaseSection } from "@/modules/financial-base/components/v2/sections";

/**
 * Módulo 2 — Mi Base Financiera (V2). Vista general: presupuesto vs real,
 * gráficas y lectura. Ingresos, Gastos y Transacciones viven en sus propias
 * rutas (/ingresos, /gastos, /transacciones). Periodo por ?period=YYYY-MM.
 */
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
        Conecta Supabase para usar tu Base Financiera (presupuesto, ingresos, gastos y transacciones).
      </div>
    );
  }

  return (
    <div className="grid">
      <BaseHeader
        title="Mi Base Financiera"
        sub="Tu centro operativo: presupuesto vs real del mes."
        period={view.period}
      />
      <MiBaseSection view={view} />
    </div>
  );
}
