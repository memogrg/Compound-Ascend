"use client";

/**
 * «Tu próxima mejor acción»: la única acción que la pantalla destaca.
 *
 * Lleva el comparador MINI —abonar (certeza) vs invertir (rango)— porque la pregunta que sigue a
 * "hacé esto" es siempre "¿y por qué no lo otro?". Cuando la regla del 12% aplica, el lado de
 * invertir dice «No aplica hoy» con su tooltip: ocultarlo sin explicar sería esconder la
 * pregunta en vez de responderla.
 */
import Link from "next/link";
import { HelpTip } from "@/components/shared/help-tip";
import { formatMoney, formatPercent } from "@/lib/format";
import type { Action, ActionPlan } from "@/modules/actions/types";
import { ActionButtons } from "./action-buttons";
import { KindChip } from "./action-card";

/** Lo que la hero necesita del comparador. Subconjunto serializable, sin tocar el servicio. */
export type MiniComparison = {
  gated: boolean;
  apr: number | null;
  /** Lado CERTEZA del comparador, tal cual lo calculó la amortización. */
  pay: { interestSaved: number; monthsSaved: number } | null;
  /** Rango típico del activo principal, si la comparación aplica. */
  invertir: { label: string; peor: number; tipico: number; maxDrawdown: number } | null;
  monthlySurplus: number;
};

export function ActionHero({
  action,
  plan,
  mini,
  onVerDecisiones,
}: {
  action: Action;
  plan: ActionPlan;
  mini: MiniComparison | null;
  onVerDecisiones: () => void;
}) {
  const c = (n: number) => formatMoney(n, plan.currency);

  return (
    <section className="card acc-hero">
      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
        <span className="eyebrow">Tu próxima mejor acción</span>
        <KindChip kind={action.kind} />
      </div>

      <h2 className="acc-hero-title">{action.title}</h2>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: "8px 0 0" }}>
        {action.why}
      </p>

      <div className="acc-hero-num">{action.impact.label}</div>

      {mini ? (
        <div className="acc-mini">
          <div className="acc-mini-col">
            <div className="acc-mini-k">
              Abonar
              <span className="acc-mini-tag" style={{ color: "var(--pos)" }}>
                certeza
              </span>
            </div>
            <div className="acc-mini-v">{mini.pay ? c(mini.pay.interestSaved) : "—"}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {mini.pay
                ? `interés que no pagás · ${mini.pay.monthsSaved} meses antes`
                : "sin deuda que abonar"}
            </div>
          </div>
          <div className="acc-mini-col">
            <div className="acc-mini-k">
              Invertir
              <span className="acc-mini-tag" style={{ color: "var(--muted)" }}>
                rango
              </span>
            </div>
            {mini.gated ? (
              <>
                <div className="acc-mini-v acc-mini-off">
                  No aplica hoy{" "}
                  <HelpTip
                    text={
                      <>
                        <strong>La regla del 12%.</strong> Arriba de esa tasa, abonar la deuda es un
                        retorno <em>garantizado</em> que ningún activo supera con certeza
                        {mini.apr != null ? ` — la tuya está al ${formatPercent(mini.apr)}` : ""}.
                        Por eso acá no se plantea invertir: no es prudencia, es aritmética.
                      </>
                    }
                  />
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  con deuda cara, la comparación no es honesta
                </div>
              </>
            ) : mini.invertir ? (
              <>
                <div className="acc-mini-v">
                  {c(mini.invertir.peor)} – {c(mini.invertir.tipico)}
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {mini.invertir.label} · caída máx. histórica{" "}
                  {formatPercent(mini.invertir.maxDrawdown)}
                </div>
              </>
            ) : (
              <div className="acc-mini-v acc-mini-off">—</div>
            )}
          </div>
        </div>
      ) : null}

      <div className="acc-actions">
        <ActionButtons action={action} />
        <Link className="btn btn-ghost" href={action.route}>
          Ir a hacerlo →
        </Link>
      </div>

      <button type="button" className="acc-why" onClick={onVerDecisiones}>
        Ver comparación completa →
      </button>
    </section>
  );
}
