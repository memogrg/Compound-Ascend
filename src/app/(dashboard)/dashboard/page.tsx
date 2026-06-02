import Link from "next/link";
import { getDashboardData } from "@/modules/dashboard";
import { DashboardView } from "@/modules/dashboard";
import { EmptyState } from "@/components/shared/states";

/**
 * Panel principal — consume datos reales del Perfil y la Base Financiera.
 * Mientras no exista base, muestra un estado de bienvenida que guía a empezar.
 * Los KPIs de Patrimonio/Rich Life enlazan a sus módulos (F6/F7).
 */
export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data.health.hasData) {
    return (
      <div className="grid">
        <div className="page-title" style={{ fontSize: 26 }}>
          Hola, <span className="it">{data.name}</span>
        </div>
        <EmptyState
          title="Construyamos tu panel"
          description="Aún no hay datos suficientes. Completa tu Perfil Financiero y tu Base Financiera y aquí verás tu flujo de caja, tu salud financiera y tu próxima mejor acción."
          action={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn btn-primary" href="/mi-perfil-financiero">
                Empezar mi perfil
              </Link>
              <Link className="btn btn-secondary" href="/mi-base-financiera">
                Agregar ingresos y gastos
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <DashboardView
      name={data.name}
      summary={data.summary}
      currency={data.currency}
      health={data.health}
      insights={data.insights}
      demo={!data.configured}
    />
  );
}
