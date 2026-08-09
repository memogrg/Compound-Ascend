"use client";

/**
 * POP-UP DEL RITMO DEL MES (móvil). Paridad de contenido con la web
 * (components/layout/rhythm-nudge.tsx): mismo estado, mismo copy, misma prioridad de UN
 * aviso a la vez. Lo que cambia es la voz —es-MX de "tú", no voseo— y la forma: acá es
 * una tarjeta anclada abajo, sobre el Fab, en vez de una flotante de escritorio.
 *
 * Consume EXACTAMENTE las mismas Server Actions que la web
 * (getRhythmStateAction / dismissRhythmNudgeAction): cero backend nuevo. Descartarlo en
 * el teléfono también lo silencia en la web, porque el silencio vive en
 * `notification_log`, no en el dispositivo.
 *
 * Importa de `@/lib/rhythm/engine` y `.../nudge-copy` (puros), nunca del barrel
 * `@/lib/rhythm` — ese arrastra `server-only` y rompe el build de cliente.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { nombreMes } from "@/lib/rhythm/engine";
import {
  copyVentana,
  copyCierre,
  copyRegistroDiario,
  elegirNudge,
  type NudgeCopy,
} from "@/lib/rhythm/nudge-copy";
import {
  getRhythmStateAction,
  dismissRhythmNudgeAction,
  type RhythmSnapshot,
} from "@/lib/rhythm/actions";

/** Adónde lleva el CTA de cada aviso (rutas /m). */
const CTA_HREF: Record<string, string> = {
  ventana_presupuesto: "/m/gastos",
  cierre_mes: "/m/transacciones",
  registro_diario: "/m/transacciones",
};

function elegir(snap: RhythmSnapshot): NudgeCopy | null {
  const s = snap.state;
  if (!s) return null;
  const mes = nombreMes(s.period.month);
  return elegirNudge({
    ventana: s.nudgeVentana
      ? copyVentana({
          voz: "tu",
          mes,
          diasRestantes: s.ventana.diasRestantes,
          sobresConPresupuesto: s.sobresConPresupuesto,
        })
      : null,
    cierre:
      s.cierre && s.cierre.length > 0
        ? copyCierre({ voz: "tu", mes, pendientes: s.cierre.map((p) => p.texto) })
        : null,
    diario: s.nudgeDiario ? copyRegistroDiario("tu") : null,
  });
}

export function MobileRhythmNudge() {
  const router = useRouter();
  const [nudge, setNudge] = useState<NudgeCopy | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;
    getRhythmStateAction()
      .then((snap) => {
        if (vivo) setNudge(elegir(snap));
      })
      .catch(() => {
        // best-effort: sin aviso.
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!nudge) return null;

  const silenciar = (kind: string) => {
    startTransition(async () => {
      try {
        await dismissRhythmNudgeAction(kind);
      } catch {
        // Si falla, reaparece en la próxima carga. Es un recordatorio, no un dato.
      }
    });
  };

  const cerrar = () => {
    const kind = nudge.kind;
    setNudge(null); // optimista: la X tiene que sentirse inmediata
    silenciar(kind);
  };

  const ir = () => {
    const href = CTA_HREF[nudge.kind];
    silenciar(nudge.kind); // tocar el CTA también lo silencia: ya cumplió su función
    setNudge(null);
    if (href) router.push(href);
  };

  return (
    <div className="m-rhythm-nudge card" role="status" aria-live="polite">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: "var(--accent)", flex: "none", marginTop: 1 }} aria-hidden>
          <Icon name="bell" width={2.4} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.35 }}>{nudge.titulo}</div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "4px 0 0" }}>
            {nudge.cuerpo}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar aviso"
          style={{ flex: "none", width: 28, height: 28 }}
          onClick={cerrar}
        >
          <Icon name="x" width={2.2} />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="m-btn m-btn-secondary"
          style={{ flex: 1 }}
          onClick={cerrar}
        >
          {nudge.descartar}
        </button>
        <button type="button" className="m-btn m-btn-primary" style={{ flex: 1 }} onClick={ir}>
          {nudge.cta}
        </button>
      </div>
    </div>
  );
}
