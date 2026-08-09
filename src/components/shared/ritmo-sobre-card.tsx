"use client";

/**
 * TARJETA DE RITMO — "vas rápido en {sobre}", con las tres salidas en un tap.
 *
 * Compartida por web y móvil. El markup es el mismo; lo que cambia son las CLASES, que
 * llegan por `skin` — el mismo patrón que ya usan las tarjetas del asistente
 * (assistant-conversation.tsx). Web y móvil tienen primitivos distintos (`btn` vs `m-btn`),
 * y duplicar el componente entero para eso haría que las cifras y el copy se separaran.
 *
 * ── LO QUE ESTA TARJETA NO HACE ─────────────────────────────────────────────
 * No regaña. No pinta el sobre de rojo, no dice "cuidado" y no usa el ícono de alerta: el
 * usuario todavía está DENTRO de su presupuesto — esto es una proyección, no un problema
 * consumado. El acento es el de atención (--warn), no el de error (--neg), que queda para
 * `sobre_sobregirado`, cuando ya se pasó.
 *
 * Las tres salidas son las del motor (lib/rhythm/spend-pace.ts) y se muestran juntas a
 * propósito: ofrecer solo "recortá" convierte el aviso en un reto. "Dejarlo así" está al
 * mismo nivel que las otras dos porque no hacer nada también es una decisión legítima —
 * a veces el mes es así.
 */
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { textoDiagnostico, textoSalida, type SenalRitmo } from "@/lib/rhythm/spend-pace";
import { aplicarMoverPresupuestoAction, descartarAvisoRitmoAction } from "@/lib/rhythm/actions";

export type RitmoSkin = {
  card: string;
  title: string;
  body: string;
  salidas: string;
  btnPrimary: string;
  btnSecondary: string;
  btnGhost: string;
  error: string;
  done: string;
};

/** Piel web (tokens de globals.css). */
export const RITMO_SKIN_WEB: RitmoSkin = {
  card: "card ritmo-card",
  title: "ritmo-card-title",
  body: "ritmo-card-body",
  salidas: "ritmo-card-salidas",
  btnPrimary: "btn btn-primary",
  btnSecondary: "btn btn-ghost",
  btnGhost: "btn btn-ghost",
  error: "auth-msg warn",
  done: "ritmo-card-done",
};

/** Piel móvil (tokens de mobile.css). */
export const RITMO_SKIN_MOBILE: RitmoSkin = {
  card: "card ritmo-card",
  title: "ritmo-card-title",
  body: "ritmo-card-body",
  salidas: "ritmo-card-salidas",
  btnPrimary: "m-btn m-btn-primary",
  btnSecondary: "m-btn m-btn-secondary",
  btnGhost: "m-btn m-btn-secondary",
  error: "m-field-err",
  done: "ritmo-card-done",
};

export function RitmoSobreCard({
  senal,
  dia,
  skin,
  voz = "vos",
  onApplied,
}: {
  senal: SenalRitmo;
  dia: number;
  skin: RitmoSkin;
  voz?: "vos" | "tu";
  /** Se llama tras aplicar o descartar, para que la pantalla refresque sus cifras. */
  onApplied?: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "movido" | "oculto">("idle");

  const mover = senal.salidas.find((s) => s.tipo === "mover");
  const bajar = senal.salidas.find((s) => s.tipo === "bajar_ritmo");

  if (phase === "oculto") return null;
  if (phase === "movido") {
    return <div className={skin.done}>✓ Presupuesto movido. Tu plan del mes ya cuadra.</div>;
  }

  const aplicarMover = async () => {
    if (!mover) return;
    setPending("mover");
    setError(null);
    const res = await aplicarMoverPresupuestoAction({
      desdeCategoryId: mover.desdeCategoryId,
      desdeName: mover.desdePath.split("›").pop()?.trim() ?? mover.desdePath,
      hastaCategoryId: senal.categoryId,
      hastaName: senal.path.split("›").pop()?.trim() ?? senal.path,
      amount: mover.monto,
      currency: senal.currency,
    });
    setPending(null);
    if (res.ok) {
      setPhase("movido");
      onApplied?.();
    } else {
      setError(res.message ?? "No pudimos mover el presupuesto.");
    }
  };

  const descartar = async () => {
    setPhase("oculto"); // optimista: cerrar tiene que sentirse inmediato
    await descartarAvisoRitmoAction(senal.categoryId).catch(() => {
      // Si falla, reaparece en la próxima pasada. Es un aviso, no un dato.
    });
    onApplied?.();
  };

  return (
    <div className={skin.card}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: "var(--warn)", flex: "none", marginTop: 1 }} aria-hidden>
          <Icon name="info" width={2.4} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* "Vas rápido" se conjuga igual en voseo y tuteo; la voz solo cambia dentro del
              diagnóstico (Llevás/Llevas, llegás/llegas). */}
          <div className={skin.title}>Vas rápido en {senal.path}</div>
          <p className={skin.body}>{textoDiagnostico(senal, dia, formatMoney, voz)}</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Descartar aviso"
          style={{ flex: "none", width: 26, height: 26 }}
          onClick={() => void descartar()}
        >
          <Icon name="x" width={2.2} />
        </button>
      </div>

      {error ? (
        <div className={skin.error} role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
      ) : null}

      <div className={skin.salidas}>
        {mover ? (
          <button
            type="button"
            className={skin.btnPrimary}
            disabled={pending !== null}
            onClick={() => void aplicarMover()}
          >
            {pending === "mover" ? "Moviendo…" : textoSalida(mover, senal.currency, formatMoney)}
          </button>
        ) : null}

        {/* "Bajar el ritmo" no es un botón: no hay nada que ejecutar en la app — el cambio es
            de comportamiento, no de datos. Se muestra como el número que hace falta para
            decidirlo, que es lo único que la app puede aportar ahí. */}
        {bajar ? (
          <div className={skin.body}>{textoSalida(bajar, senal.currency, formatMoney)}</div>
        ) : null}

        <button type="button" className={skin.btnGhost} onClick={() => void descartar()}>
          Dejarlo así
        </button>
      </div>
    </div>
  );
}
