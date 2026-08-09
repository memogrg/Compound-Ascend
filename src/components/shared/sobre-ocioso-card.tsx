"use client";

/**
 * TARJETA DE SOBRE OCIOSO — "casi no usás {sobre}", con las salidas en un tap.
 *
 * Hermana de `RitmoSobreCard`: comparte la piel (`RitmoSkin`) y el mismo criterio de tono.
 * Aquél mira el sobre que va muy rápido, éste el que no se mueve.
 *
 * ── LA DIFERENCIA IMPORTANTE: FUSIONAR ES DESTRUCTIVO ───────────────────────
 * "Mover" es reversible —se mueve de vuelta y listo—, así que va en un tap como en la tarjeta
 * de ritmo. "Fusionar" NO: `mergeCategory` reasigna todas las transacciones y líneas de
 * presupuesto del sobre origen y después lo borra. Por eso pide una segunda confirmación
 * dentro de la misma tarjeta, que dice exactamente qué va a pasar.
 *
 * Poner las dos al mismo nivel de fricción sería mentir sobre lo que cuesta cada una.
 */
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { textoOcioso, textoSalidaOcioso, type SobreOcioso } from "@/lib/rhythm/idle-envelopes";
import {
  aplicarMoverPresupuestoAction,
  fusionarSobresAction,
  descartarAvisoOciosoAction,
} from "@/lib/rhythm/actions";
import type { RitmoSkin } from "@/components/shared/ritmo-sobre-card";

/** Última hoja de un "Frasco › Sobre" (lo que espera `setCategoryBudget` como `name`). */
const hoja = (path: string): string => path.split("›").pop()?.trim() ?? path;

export function SobreOciosoCard({
  ocioso,
  skin,
  voz = "vos",
  onApplied,
}: {
  ocioso: SobreOcioso;
  skin: RitmoSkin;
  voz?: "vos" | "tu";
  onApplied?: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "confirmar-fusion" | "hecho" | "oculto">("idle");
  const [hecho, setHecho] = useState<string>("");

  const mover = ocioso.salidas.find((s) => s.tipo === "mover");
  const fusionar = ocioso.salidas.find((s) => s.tipo === "fusionar");

  if (phase === "oculto") return null;
  if (phase === "hecho") return <div className={skin.done}>{hecho}</div>;

  const descartar = async () => {
    setPhase("oculto"); // optimista
    await descartarAvisoOciosoAction(ocioso.categoryId).catch(() => {});
    onApplied?.();
  };

  const aplicarMover = async () => {
    if (!mover) return;
    setPending("mover");
    setError(null);
    const res = await aplicarMoverPresupuestoAction({
      desdeCategoryId: ocioso.categoryId,
      desdeName: hoja(ocioso.path),
      hastaCategoryId: mover.hastaCategoryId,
      hastaName: hoja(mover.hastaPath),
      amount: mover.monto,
      currency: ocioso.currency,
    });
    setPending(null);
    if (res.ok) {
      setHecho(`✓ ${formatMoney(mover.monto, ocioso.currency)} ahora están en ${mover.hastaPath}.`);
      setPhase("hecho");
      onApplied?.();
    } else {
      setError(res.message ?? "No pudimos mover el presupuesto.");
    }
  };

  const aplicarFusion = async () => {
    if (!fusionar) return;
    setPending("fusionar");
    setError(null);
    const res = await fusionarSobresAction({
      fromId: ocioso.categoryId,
      intoId: fusionar.hastaCategoryId,
    });
    setPending(null);
    if (res.ok) {
      setHecho(`✓ ${ocioso.path} ahora es parte de ${fusionar.hastaPath}.`);
      setPhase("hecho");
      onApplied?.();
    } else {
      setError(res.message ?? "No pudimos fusionar los sobres.");
      setPhase("idle");
    }
  };

  // Segundo paso de "fusionar": dice exactamente qué se va a hacer antes de hacerlo.
  if (phase === "confirmar-fusion" && fusionar) {
    return (
      <div className={skin.card}>
        <div className={skin.title}>
          ¿Fusionar {ocioso.path} con {fusionar.hastaPath}?
        </div>
        <p className={skin.body}>
          Los movimientos y el presupuesto de {ocioso.path} pasan a {fusionar.hastaPath}, y el sobre
          desaparece de tu lista. No se pierde ningún gasto registrado, pero{" "}
          <strong>esto no se puede deshacer</strong>.
        </p>
        {error ? (
          <div className={skin.error} role="alert" style={{ marginTop: 8 }}>
            {error}
          </div>
        ) : null}
        <div className={skin.salidas}>
          <button
            type="button"
            className={skin.btnPrimary}
            disabled={pending !== null}
            onClick={() => void aplicarFusion()}
          >
            {pending === "fusionar" ? "Fusionando…" : "Sí, fusionar"}
          </button>
          <button
            type="button"
            className={skin.btnGhost}
            disabled={pending !== null}
            onClick={() => setPhase("idle")}
          >
            Mejor no
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={skin.card}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: "var(--muted)", flex: "none", marginTop: 1 }} aria-hidden>
          <Icon name="info" width={2.4} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* "Casi no usás/usas" sí cambia de conjugación. */}
          <div className={skin.title}>
            Casi no {voz === "vos" ? "usás" : "usas"} {ocioso.path}
          </div>
          <p className={skin.body}>{textoOcioso(ocioso, formatMoney, voz)}</p>
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
            {pending === "mover"
              ? "Moviendo…"
              : textoSalidaOcioso(mover, ocioso.currency, formatMoney)}
          </button>
        ) : null}

        {fusionar ? (
          <button
            type="button"
            className={skin.btnSecondary}
            disabled={pending !== null}
            onClick={() => setPhase("confirmar-fusion")}
          >
            {textoSalidaOcioso(fusionar, ocioso.currency, formatMoney)}
          </button>
        ) : null}

        <button type="button" className={skin.btnGhost} onClick={() => void descartar()}>
          Dejarlo como está
        </button>
      </div>
    </div>
  );
}
