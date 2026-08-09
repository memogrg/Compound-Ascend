"use client";

/**
 * POP-UP DEL RITMO DEL MES (web). Tarjeta descartable abajo a la derecha con UN aviso a
 * la vez: ventana de configuración, cierre de mes o recordatorio de registro.
 *
 * Por qué existe además de la campana: la campana se alimenta de `user_insights`, que se
 * recalcula detrás de una guardia de frescura de 12 h (`isStale`, insights-service.ts).
 * Eso está bien para "tu fondo de emergencia está corto" y es inservible para "son las
 * 19:00 y no registraste nada" — a las 19:30 la guardia todavía daría por fresca la
 * pasada de las 9:00. Este componente lee el estado EN VIVO, sin guardia.
 *
 * Importa de `@/lib/rhythm/engine` y `@/lib/rhythm/nudge-copy` (puros), NUNCA del barrel
 * `@/lib/rhythm`: ese reexporta el service con `server-only` y arrastrarlo acá rompe el
 * build de cliente (y no siempre en local — se cae en CI).
 */
import { useEffect, useState } from "react";
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

/** Adónde lleva el CTA de cada aviso (rutas web). */
const CTA_HREF: Record<string, string> = {
  ventana_presupuesto: "/gastos",
  cierre_mes: "/transacciones",
  registro_diario: "/transacciones",
};

/** Traduce el estado del servidor al aviso a mostrar (o null si no hay ninguno). */
function elegir(snap: RhythmSnapshot): NudgeCopy | null {
  const s = snap.state;
  if (!s) return null;
  const mes = nombreMes(s.period.month);
  return elegirNudge({
    ventana: s.nudgeVentana
      ? copyVentana({
          voz: "vos",
          mes,
          diasRestantes: s.ventana.diasRestantes,
          sobresConPresupuesto: s.sobresConPresupuesto,
        })
      : null,
    // `cierre` es null fuera de los días de cierre y `[]` cuando no falta nada: en los
    // dos casos no hay aviso, pero por razones distintas (ver RhythmState).
    cierre:
      s.cierre && s.cierre.length > 0
        ? copyCierre({ voz: "vos", mes, pendientes: s.cierre.map((p) => p.texto) })
        : null,
    diario: s.nudgeDiario ? copyRegistroDiario("vos") : null,
  });
}

export function RhythmNudge() {
  const router = useRouter();
  const [nudge, setNudge] = useState<NudgeCopy | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    getRhythmStateAction()
      .then((snap) => {
        if (vivo) setNudge(elegir(snap));
      })
      .catch(() => {
        // best-effort: sin aviso. Nunca rompe la pantalla en la que está montado.
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!nudge) return null;

  const cerrar = () => {
    setSaliendo(true);
    // Optimista y con la animación de salida: la escritura que lo silencia por el resto
    // del día puede tardar, pero la X tiene que sentirse inmediata.
    window.setTimeout(() => setNudge(null), 160);
    void dismissRhythmNudgeAction(nudge.kind).catch(() => {
      // Si falla, vuelve a aparecer en la próxima carga. Aceptable: es un recordatorio.
    });
  };

  const ir = () => {
    const href = CTA_HREF[nudge.kind];
    // Tocar el CTA también lo silencia: ya cumplió su función, insistir sería absurdo.
    void dismissRhythmNudgeAction(nudge.kind).catch(() => {});
    setNudge(null);
    if (href) router.push(href);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="card rhythm-nudge"
      data-leaving={saliendo ? "" : undefined}
    >
      <div className="rhythm-nudge-head">
        <span className="rhythm-nudge-icon" aria-hidden>
          <Icon name="bell" width={2.4} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rhythm-nudge-title">{nudge.titulo}</div>
          <p className="rhythm-nudge-body">{nudge.cuerpo}</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar aviso"
          style={{ flex: "none", width: 26, height: 26 }}
          onClick={cerrar}
        >
          <Icon name="x" width={2.2} />
        </button>
      </div>
      <div className="rhythm-nudge-foot">
        <button type="button" className="btn btn-ghost" onClick={cerrar}>
          {nudge.descartar}
        </button>
        <button type="button" className="btn btn-primary" onClick={ir}>
          {nudge.cta}
        </button>
      </div>
    </div>
  );
}
