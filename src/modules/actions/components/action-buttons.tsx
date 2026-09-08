"use client";

/**
 * Los tres botones de toda acción: «Lo hago» · «Recordarme» · «No por ahora».
 *
 * Viven en un componente propio porque la hero y las tarjetas numeradas ofrecen exactamente las
 * mismas tres salidas — y si divergieran, la persona tendría que aprender dos gramáticas para
 * la misma decisión.
 *
 * «Lo hago» registra el impacto que la acción TRAÍA, congelado: el motor deja de emitirla justo
 * porque se hizo, así que después ya no habría de dónde recalcularlo.
 */
import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { markActionDone, snoozeAction, dismissAction } from "@/modules/actions/api/actions";
import type { Action } from "@/modules/actions/types";

/**
 * «Recordarme» = el día 15 o el 1 del mes siguiente, el que llegue primero. Son los dos momentos
 * en que el mes vuelve a tener sentido revisar (mitad de mes y apertura), así que posponer no
 * necesita un selector de fecha: necesita una promesa corta y creíble.
 */
export function proximoRecordatorio(hoy: Date): string {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const d = hoy.getDate();
  const iso = (fecha: Date) =>
    `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(
      fecha.getDate(),
    ).padStart(2, "0")}`;
  return d < 15 ? iso(new Date(y, m, 15)) : iso(new Date(y, m + 1, 1));
}

export function ActionButtons({ action, compact }: { action: Action; compact?: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();

  const correr = (fn: () => Promise<{ ok: boolean; message?: string }>, exito: string) => {
    start(async () => {
      const res = await fn();
      if (res.ok) toast(exito);
      else toast(res.message ?? "No se pudo guardar", "error");
    });
  };

  return (
    <div className="acc-btns">
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          correr(() => markActionDone(action.key, action.impact), "Anotado. Bien ahí.")
        }
      >
        Lo hago
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() =>
          correr(
            () => snoozeAction(action.key, proximoRecordatorio(new Date())),
            "Te la recuerdo pronto.",
          )
        }
      >
        Recordarme
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending}
        onClick={() =>
          correr(
            () => dismissAction(action.key, action.relatedInsightId),
            "Listo, no te la vuelvo a proponer.",
          )
        }
      >
        {compact ? "No" : "No por ahora"}
      </button>
    </div>
  );
}
