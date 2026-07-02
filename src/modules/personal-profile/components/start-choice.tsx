"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { BrandMark } from "@/components/layout/brand-mark";
import { startWithDemoAction, startManualAction } from "@/modules/personal-profile/api/actions";
import { cn } from "@/lib/utils";

type Choice = "guided" | "manual" | "demo";

const OPTIONS: { id: Choice; icon: IconName; title: string; desc: string; badge?: string }[] = [
  {
    id: "guided",
    icon: "spark",
    title: "Guíame paso a paso",
    desc: "Un asistente conversacional corto que arma tu perfil financiero y te da un diagnóstico personalizado.",
    badge: "Recomendado",
  },
  {
    id: "manual",
    icon: "budget",
    title: "Quiero cargarlo manualmente",
    desc: "Ve directo a la app y agrega tus ingresos, gastos, metas y deudas a tu ritmo, cuando quieras.",
  },
  {
    id: "demo",
    icon: "invest",
    title: "Crear ejemplo y editarlo",
    desc: "Cargamos una plantilla realista lista para que la edites. La forma más rápida de ver la app llena.",
  },
];

export function StartChoice({ onGuided }: { onGuided: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (id: Choice) => {
    setError(null);
    if (id === "guided") {
      onGuided();
      return;
    }
    setBusy(id);
    const res = id === "demo" ? await startWithDemoAction() : await startManualAction();
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setBusy(null);
      setError(res.message ?? "Algo salió mal. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="wiz-canvas" style={{ minHeight: "100vh", justifyContent: "center" }}>
      <section className="step-frame wide">
        <div className="brand" style={{ border: 0, padding: 0, marginBottom: 20 }}>
          <BrandMark />
          <div>
            <div className="brand-name">
              CARTERA<span className="ascend">+</span>
            </div>
            <div className="brand-sub">Tu asesor financiero personal</div>
          </div>
        </div>

        <div className="step-eyebrow">Bienvenido</div>
        <h1 className="step-title">
          ¿Cómo quieres <span className="it">empezar</span>?
        </h1>
        <p className="step-sub">
          Elige la forma que más te acomode. Puedes cambiar de opinión cuando quieras: todo es
          editable.
        </p>

        {error ? <div className="auth-msg warn">{error}</div> : null}

        <div className="opt-grid c3">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              className={cn("opt", busy === o.id && "selected")}
              onClick={() => choose(o.id)}
              disabled={busy !== null}
              style={{ textAlign: "left", opacity: busy && busy !== o.id ? 0.5 : 1 }}
            >
              {o.badge ? (
                <span
                  className="chip"
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    background: "var(--pos-soft)",
                    color: "var(--pos)",
                  }}
                >
                  {o.badge}
                </span>
              ) : null}
              <span
                className="opt-icon"
                style={{ background: "var(--green-soft)", color: "var(--green)" }}
              >
                <Icon name={o.icon} filled={o.icon === "spark"} />
              </span>
              <span className="opt-name">{o.title}</span>
              <span className="opt-desc">{o.desc}</span>
              {busy === o.id ? (
                <span className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {o.id === "demo" ? "Creando tu ejemplo…" : "Preparando…"}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="callout" style={{ marginTop: 22 }}>
          <div className="ico">
            <Icon name="defense" width={2.4} />
          </div>
          <div className="callout-text">
            <strong>Tu información es privada.</strong> Solo tú puedes verla y editarla. Nada se
            comparte ni se ejecuta sin tu confirmación.
          </div>
        </div>
      </section>
    </div>
  );
}
