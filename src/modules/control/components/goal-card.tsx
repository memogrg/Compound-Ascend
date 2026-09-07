"use client";

/**
 * Tarjeta de un objetivo de ahorro, con su barra de progreso.
 *
 * Vive en su propio archivo CLIENTE (antes estaba dentro de control-dashboard,
 * que es server component) para poder mover la barra al instante: hasta acá el
 * progreso venía sólo del servidor, así que tras aportar se quedaba quieto todo
 * el round-trip y parecía que el aporte no había entrado. Es el mismo arreglo
 * que #749 hizo con la barra de ingresos.
 *
 * El optimista es EXACTO en metas: un aporte suma su monto al acumulado, sin
 * splits ni conversiones — siempre que la moneda del aporte sea la de la meta.
 * Si el modal la cambia, el servidor convierte y acá no se inventa el número:
 * se deja que llegue el dato real. Ver también `debts-view`, donde el saldo NO
 * se puede anticipar (el servidor lo recalcula amortizando).
 */
import { useMemo } from "react";
import { DeleteButton } from "./delete-button";
import { PagoVinculadoButton } from "./pago-vinculado-button";
import { GoalWithdrawButton } from "./goal-withdraw-button";
import { GoalSpendButton } from "./goal-spend-button";
import { GoalDetailButton } from "./goal-detail-button";
import { EditControlButton } from "./control-actions";
import { formatMoney } from "@/lib/format";
// Del ENGINE directo, no del barrel: `@/modules/control` reexporta servicios con
// `server-only` y este es un client component.
import { aporteOptimista } from "@/modules/control/engine/aporte-optimista";
import { useBarraAnticipada } from "@/lib/ui/use-barra-anticipada";
import type { ControlSummary } from "@/modules/control/services/control-service";
import type { GoalAction, SavingsGoal } from "@/modules/control/types";

const RECURRENCE_LABEL: Record<string, string> = {
  mensual: "Mensual",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

function fmtResetDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ACTION: Record<GoalAction, { label: string; color: string; bg: string }> = {
  mantener: { label: "Mantener", color: "var(--pos)", bg: "var(--pos-soft)" },
  acelerar: { label: "Acelerar", color: "var(--info)", bg: "var(--info-soft)" },
  reducir: { label: "Reducir", color: "var(--warn)", bg: "var(--warn-soft)" },
  pausar: { label: "Pausar", color: "var(--neg)", bg: "var(--neg-soft)" },
  convertir: { label: "Convertir a inversión", color: "var(--c-invest)", bg: "var(--info-soft)" },
  replantear: { label: "Replantear", color: "var(--warn)", bg: "var(--warn-soft)" },
};

export function GoalCard({
  g,
  d,
  currency,
}: {
  g: SavingsGoal;
  d: ControlSummary["diagnosis"];
  currency: string;
}) {
  /**
   * BARRA AL INSTANTE, sin rebote. Antes era `useOptimistic` y acá el rebote era
   * inmediato: `PagoVinculadoButton` llama `onDone()` y recién DESPUÉS
   * `router.refresh()`, así que la transición de este callback envolvía sólo el
   * update optimista y cerraba en el acto — el aporte se pintaba y se borraba
   * antes de que llegara ninguna prop. El anticipo ahora se sostiene hasta que
   * el servidor refleje el monto (comparando valores, no esperando un tiempo).
   */
  const servidor = useMemo(() => ({ [g.id]: g.currentAmount }), [g.id, g.currentAmount]);
  const barra = useBarraAnticipada(servidor);

  const rec = d.goalRecs.find((r) => r.goalId === g.id);
  const a = rec ? ACTION[rec.action] : ACTION.mantener;
  // Un sobre acumula sin meta: no hay barra ni % de progreso.
  const isSobre = g.kind === "sobre" || g.targetAmount <= 0;
  const acumulado = barra.valor(g.id);
  const progress = g.targetAmount > 0 ? Math.min(100, (acumulado / g.targetAmount) * 100) : 0;

  return (
    <div className="goal">
      <div className="gt">
        <span className="gn">{g.name}</span>
        <span className="chip" style={{ background: a.bg, color: a.color, fontWeight: 700 }}>
          {a.label}
        </span>
      </div>
      {isSobre ? null : (
        <div className="bar">
          <div className="fl" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="gs">
        <span className="gnum">{formatMoney(acumulado, g.currency)}</span>
        {isSobre ? (
          <span className="muted"> · acumulado (sobre)</span>
        ) : (
          <> / {formatMoney(g.targetAmount, g.currency)}</>
        )}
        {rec?.reason ? <> · {rec.reason}</> : null}
      </div>
      {g.recurrence && g.recurrence !== "ninguna" ? (
        <div
          className="gs tip tip-wrap"
          data-tip="Frasco recurrente: al llegar la fecha, la meta se restaura al monto del período y lo no gastado se arrastra."
          style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "help" }}
        >
          <span
            className="chip"
            style={{ background: "var(--info-soft)", color: "var(--info)", fontWeight: 700 }}
          >
            {RECURRENCE_LABEL[g.recurrence] ?? "Recurrente"}
          </span>
          {g.nextResetOn ? (
            <span className="muted">Próximo reinicio: {fmtResetDate(g.nextResetOn)}</span>
          ) : null}
        </div>
      ) : null}
      {/* Referencia "dónde está el dinero" (stored_in), discreta y solo si tiene valor. */}
      {g.storedIn ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          {g.storedIn}
        </div>
      ) : null}
      <div className="acts">
        <GoalDetailButton goal={g} />
        {/* Aportar va PRIMERO y como acción primaria: es lo que se hace todos los meses;
            gastar y retirar son excepciones. */}
        <PagoVinculadoButton
          kind="meta"
          id={g.id}
          name={g.name}
          onDone={(aplicado) => {
            // El guardia de "sólo si el número es exacto" vive en el motor, con
            // test: en otra moneda el servidor convierte y no se anticipa nada.
            const delta = aporteOptimista({ aplicado, monedaEntidad: g.currency });
            if (delta > 0) barra.anticipar(g.id, delta);
          }}
        />
        <GoalSpendButton goal={g} />
        <GoalWithdrawButton goal={g} />
        <EditControlButton kind="goal" item={g} currency={currency} />
        <DeleteButton id={g.id} kind="goal" />
      </div>
    </div>
  );
}
