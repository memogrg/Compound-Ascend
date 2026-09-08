"use client";

/**
 * «Mis acciones»: el ÚNICO lugar donde viven las recomendaciones, con orden, estado y
 * explicación.
 *
 * Tres pestañas y un selector de prioridad. La prioridad reordena y cambia el tono — nunca las
 * reglas —, y eso se dice en el tooltip del selector, no en un párrafo: si hubiera que explicarlo
 * con un párrafo, el selector estaría mal diseñado.
 *
 * La pestaña vive TAMBIÉN en la URL (`?tab=`) porque el selector de deuda de Decisiones navega
 * para recalcular en el servidor: sin eso, cada cambio de deuda te devolvería a "Este mes".
 */
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HelpTip } from "@/components/shared/help-tip";
import { EmptyState } from "@/components/shared/states";
import { useToast } from "@/components/ui/toast";
import { setActionPriority } from "@/modules/actions/api/actions";
import type { ActionPlan, ActionPriority, ActionProgress } from "@/modules/actions/types";
import { ActionCard } from "./action-card";
import { ActionHero, type MiniComparison } from "./action-hero";
import { PriorityNote } from "./priority-note";
import { StageRail } from "./stage-rail";
import { ProgressTab } from "./progress-tab";

export type ActionsTab = "mes" | "decisiones" | "progreso";

const TABS: { id: ActionsTab; label: string }[] = [
  { id: "mes", label: "Este mes" },
  { id: "decisiones", label: "Decisiones" },
  { id: "progreso", label: "Progreso" },
];

const PRIORIDADES: { id: ActionPriority; label: string }[] = [
  { id: "deudas", label: "Salir de deudas" },
  { id: "orden", label: "Ordenarme" },
  { id: "proteger", label: "Protegerme" },
  { id: "crecer", label: "Hacer crecer" },
];

const AYUDA_PRIORIDAD =
  "Tu prioridad ordena las acciones y cambia el tono con el que te las explico. No cambia las reglas: una deuda cara sigue bloqueando los aportes, y los fondos de defensa siguen yendo antes que el mercado.";

export function ActionsView({
  plan,
  progress,
  mini,
  decisiones,
  initialTab = "mes",
}: {
  plan: ActionPlan;
  progress: ActionProgress;
  mini: MiniComparison | null;
  /** <DecisionsTab …/> ya armado en el servidor (incluye el comparador reutilizado). */
  decisiones: ReactNode;
  initialTab?: ActionsTab;
}) {
  const [tab, setTab] = useState<ActionsTab>(initialTab);
  const [pending, start] = useTransition();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  // La URL manda cuando cambia por navegación (el selector de deuda de Decisiones).
  useEffect(() => setTab(initialTab), [initialTab]);

  const irA = (next: ActionsTab) => {
    setTab(next);
    const qs = new URLSearchParams(params?.toString() ?? "");
    qs.set("tab", next);
    router.replace(`/mis-acciones?${qs.toString()}`, { scroll: false });
  };

  const cambiarPrioridad = (p: ActionPriority) => {
    if (p === plan.priority) return;
    start(async () => {
      const res = await setActionPriority(p);
      if (!res.ok) toast(res.message ?? "No se pudo guardar", "error");
    });
  };

  const vacio = !plan.hero && plan.now.length === 0 && plan.later.length === 0;

  return (
    <div className="grid">
      <header className="acc-head">
        <div>
          <h1 className="page-title">Mis acciones</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Qué hacer con tu dinero este mes, en qué orden y por qué.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="seg acc-seg">
            {PRIORIDADES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`seg-btn${p.id === plan.priority ? " on" : ""}`}
                disabled={pending}
                onClick={() => cambiarPrioridad(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <HelpTip text={AYUDA_PRIORIDAD} />
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Secciones de Mis acciones">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " on" : ""}`}
            onClick={() => irA(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="acc-layout">
        <div className="acc-main">
          {tab === "mes" ? (
            <>
              <PriorityNote note={plan.note} />
              {vacio ? (
                <EmptyState
                  icon="check"
                  title="Estás al día"
                  description="No hay ninguna acción pendiente con impacto medible. Cuando algo cambie en tu presupuesto, tus deudas o tu portafolio, aparece acá."
                />
              ) : (
                <>
                  {plan.hero ? (
                    <ActionHero
                      action={plan.hero}
                      plan={plan}
                      mini={mini}
                      onVerDecisiones={() => irA("decisiones")}
                    />
                  ) : null}

                  {plan.now.length > 0 ? (
                    <section>
                      <div className="eyebrow" style={{ marginBottom: 10 }}>
                        Después de esa
                      </div>
                      <div className="grid" style={{ gap: 12 }}>
                        {plan.now.map((a, i) => (
                          <ActionCard key={a.key} action={a} index={i + 2} />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {plan.later.length > 0 ? (
                    <section>
                      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
                        <div className="eyebrow">Cuando termines estas</div>
                        <HelpTip text="No están escondidas: están esperando. Cada una dice qué tiene que pasar para desbloquearse — y eso es exactamente lo que las acciones de arriba están haciendo." />
                      </div>
                      <div className="grid" style={{ gap: 12 }}>
                        {plan.later.map((a, i) => (
                          <ActionCard key={a.key} action={a} index={plan.now.length + i + 2} />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {tab === "decisiones" ? decisiones : null}
          {tab === "progreso" ? <ProgressTab progress={progress} /> : null}
        </div>

        <StageRail plan={plan} />
      </div>
    </div>
  );
}
