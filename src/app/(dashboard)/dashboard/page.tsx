import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getDashboardData } from "@/modules/dashboard";
import { DashboardView } from "@/modules/dashboard";
import { EmptyState } from "@/components/shared/states";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoData } from "@/modules/account/services/account-service";
import { DemoBanner } from "@/components/shared/demo-banner";
import { Observations, type Observation } from "@/modules/dashboard/components/observations";

/** Datos del panel en streaming: el shell pinta de inmediato con skeletons. */
async function DashboardContent() {
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

  // Observaciones conductuales (memoria conductual, Fase 4d). Best-effort.
  let observations: Observation[] = [];
  try {
    const { getActiveInsights } = await import("@/lib/insights");
    observations = await getActiveInsights(5);
  } catch {
    // Sin observaciones: el panel sigue.
  }

  return (
    <>
      {showDemoBanner ? (
        <div style={{ marginBottom: 18 }}>
          <DemoBanner />
        </div>
      ) : null}
      <Observations observations={observations} />
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

function DashboardSkeleton() {
  return (
    <div className="grid" aria-hidden="true">
      <div className="skel" style={{ height: 34, width: 280 }} />
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="skel" style={{ height: 190 }} />
        <div className="skel" style={{ height: 190 }} />
      </div>
      <div className="skel" style={{ height: 150 }} />
      <div className="skel" style={{ height: 260 }} />
    </div>
  );
}

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

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
