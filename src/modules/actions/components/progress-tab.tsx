"use client";

/**
 * Pestaña «Progreso»: lo que la persona ya decidió, y lo que eso valió.
 *
 * Los montos vienen CONGELADOS de la fila (el impacto que la acción traía cuando se marcó).
 * No se recalculan a propósito: el motor deja de emitir una acción justo porque se hizo, así
 * que recalcular daría cero — y borraría el mérito.
 */
import { useTransition } from "react";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/states";
import { reactivateAction } from "@/modules/actions/api/actions";
import type { ActionProgress, ActionState } from "@/modules/actions/types";

function fecha(iso: string): string {
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
  return `${Number(iso.slice(8, 10))} ${meses[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;
}

/** La clave es determinista y legible: '<fuente>:<dominio>:<referencia>'. */
function titulo(state: ActionState): string {
  return state.impact?.label ?? state.actionKey;
}

function Reactivar({ actionKey }: { actionKey: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await reactivateAction(actionKey);
          toast(
            res.ok ? "Vuelve a tu lista." : (res.message ?? "No se pudo"),
            res.ok ? "success" : "error",
          );
        })
      }
    >
      Reactivar
    </button>
  );
}

export function ProgressTab({ progress }: { progress: ActionProgress }) {
  const c = (n: number) => formatMoney(n, progress.currency);
  const total = progress.done.length + progress.snoozed.length + progress.dismissed.length;

  if (total === 0) {
    return (
      <EmptyState
        icon="check"
        title="Todavía no hay historial"
        description="Cuando marqués una acción como hecha, pospuesta o descartada, acá vas a ver qué decidiste y cuánto valió."
      />
    );
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="acc-tiles">
        <div className="card card-pad">
          <div className="label">Intereses evitados</div>
          <div className="acc-tile-v">{c(progress.interestAvoided)}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            suma de lo que valían las acciones que hiciste
          </div>
        </div>
        <div className="card card-pad">
          <div className="label">Meses ganados</div>
          <div className="acc-tile-v">{progress.monthsGained}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            adelanto acumulado en tus liquidaciones
          </div>
        </div>
        <div className="card card-pad">
          <div className="label">Decisiones</div>
          <div className="acc-tile-v">
            {progress.done.length}·{progress.snoozed.length}·{progress.dismissed.length}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            hechas · pospuestas · descartadas
          </div>
        </div>
      </div>

      {progress.done.length > 0 ? (
        <section className="card">
          <div className="card-head">
            <div className="card-title">Lo que hiciste</div>
          </div>
          <ol className="acc-timeline">
            {progress.done.map((s) => (
              <li key={s.id}>
                <span className="acc-timeline-d">{fecha(s.updatedAt)}</span>
                <span className="acc-timeline-t">{titulo(s)}</span>
                <span className="acc-timeline-k mono">{s.actionKey}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {progress.snoozed.length > 0 || progress.dismissed.length > 0 ? (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Pospuestas y descartadas</div>
              <div className="card-sub">
                Nada se pierde: reactivá cualquiera y vuelve a competir por su lugar.
              </div>
            </div>
          </div>
          <ul className="acc-timeline">
            {[...progress.snoozed, ...progress.dismissed].map((s) => (
              <li key={s.id}>
                <span className="acc-timeline-d">
                  {s.status === "pospuesta" && s.snoozeUntil
                    ? `hasta ${fecha(s.snoozeUntil)}`
                    : fecha(s.updatedAt)}
                </span>
                <span className="acc-timeline-t">{titulo(s)}</span>
                <Reactivar actionKey={s.actionKey} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
