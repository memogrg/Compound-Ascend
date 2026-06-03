import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardData } from "@/modules/dashboard";
import { DashboardView } from "@/modules/dashboard";
import { EmptyState } from "@/components/shared/states";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoData } from "@/modules/account/services/account-service";
import { DemoBanner } from "@/components/shared/demo-banner";

/**
 * Panel principal — consume datos reales del Perfil y la Base Financiera.
 * Los usuarios nuevos (onboarding incompleto) se envían a /bienvenida para que
 * elijan cómo empezar (guiado / manual / ejemplo).
 */
export default async function DashboardPage() {
  if (isSupabaseConfigured()) {
    const user = await getUser();
    if (user) {
      const supabase = await createSupabaseServerClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (profile && !profile.onboarding_completed) redirect("/bienvenida");
    }
  }

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

  const showDemoBanner = data.configured && (await isDemoData());

  return (
    <>
      {showDemoBanner ? (
        <div style={{ marginBottom: 18 }}>
          <DemoBanner />
        </div>
      ) : null}
      <DashboardView
        name={data.name}
        summary={data.summary}
        currency={data.currency}
        health={data.health}
        insights={data.insights}
        demo={!data.configured}
      />
    </>
  );
}
