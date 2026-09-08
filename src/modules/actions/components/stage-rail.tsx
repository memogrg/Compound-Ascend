"use client";

/**
 * El rail: en qué etapa del camino estás y con qué se decidió el orden.
 *
 * Las cinco etapas son una escalera, no un puntaje: la actual es la primera que falla, y las
 * que vienen después están atenuadas porque todavía no son tu problema. Ese es el punto — que
 * la persona sepa qué NO tiene que estar mirando ahora.
 *
 * «Con qué decidimos» existe por la misma razón que existe este módulo: una recomendación sin
 * sus insumos a la vista es una orden.
 */
import { HelpTip } from "@/components/shared/help-tip";
import { formatMoney } from "@/lib/format";
import type { ActionPlan } from "@/modules/actions/types";

const ETAPAS = [
  { label: "Estabilidad", sub: "Tu flujo del mes cierra en positivo" },
  { label: "Protección mínima", sub: "Fondos de emergencia y paz cubiertos" },
  { label: "Sin deuda cara", sub: "Ninguna deuda por encima del 12%" },
  { label: "Crecimiento inicial", sub: "Un aporte mensual automático corriendo" },
  { label: "Crecimiento estructurado", sub: "Cartera diversificada, sin concentración" },
];

function fechaCorta(iso: string): string {
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "set",
    "oct",
    "nov",
    "dic",
  ];
  return `${Number(iso.slice(8, 10))} ${meses[Number(iso.slice(5, 7)) - 1] ?? ""}`;
}

export function StageRail({ plan }: { plan: ActionPlan }) {
  const { stage, inputs, currency } = plan;
  const c = (n: number) => formatMoney(n, currency);

  return (
    <aside className="acc-rail">
      <section className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <div className="card-title" style={{ fontSize: 14 }}>
            Tu etapa
          </div>
          <HelpTip text="Las cinco etapas van en orden: cada una se apoya en la anterior. Tu etapa actual es la primera que todavía no se cumple — las siguientes no son tu problema hoy." />
        </div>
        <ol className="acc-stages">
          {ETAPAS.map((e, i) => {
            const nivel = i + 1;
            const estado =
              nivel < stage.level ? "hecha" : nivel === stage.level ? "actual" : "futura";
            return (
              <li key={e.label} className={`acc-stage acc-stage-${estado}`}>
                <span className="acc-stage-dot">{estado === "hecha" ? "✓" : nivel}</span>
                <div>
                  <div className="acc-stage-t">{e.label}</div>
                  <div className="acc-stage-s">{e.sub}</div>
                  {estado === "actual" && stage.blockers.length > 0 ? (
                    <ul className="acc-blockers">
                      {stage.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <div className="card-title" style={{ fontSize: 14 }}>
            Con qué decidimos
          </div>
          <HelpTip text="Estos son los insumos exactos del orden que ves. Ninguna cifra la inventa un modelo: todas salen de tu presupuesto, tus deudas y tus fondos." />
        </div>
        <dl className="acc-inputs">
          <div>
            <dt>Sobrante del mes</dt>
            <dd>{c(inputs.surplus)}</dd>
          </div>
          <div>
            <dt>Deuda más cara</dt>
            <dd>
              {inputs.expensiveDebt
                ? `${inputs.expensiveDebt.name} · ${inputs.expensiveDebt.apr}%`
                : "Ninguna sobre 12%"}
            </dd>
          </div>
          <div>
            <dt>Fondos de defensa</dt>
            <dd>{inputs.fundsCovered ? "Cubiertos" : "En construcción"}</dd>
          </div>
          <div>
            <dt>Objetivos activos</dt>
            <dd>{inputs.activeGoals}</dd>
          </div>
          <div>
            <dt>Próxima revisión</dt>
            <dd>{fechaCorta(inputs.nextReview)}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
