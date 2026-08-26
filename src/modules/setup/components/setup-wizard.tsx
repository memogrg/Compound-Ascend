"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { HelpTip } from "@/components/shared/help-tip";

/**
 * MOTOR COMPARTIDO de los asistentes de configuración.
 *
 * Es el patrón del wizard de ADN financiero (una decisión por pantalla, ayuda
 * en tooltip, microcelebración al avanzar, guardado sin botón "guardar")
 * extraído a un componente parametrizable por una lista de pasos. Los cuatro
 * asistentes son configuraciones de ESTE componente, y el móvil monta el mismo
 * con `skin="mobile"`: una sola máquina, dos pieles.
 *
 * ── DIFERENCIA DE FONDO CON EL WIZARD DE PERFIL ─────────────────────────────
 * Aquel acumula un `draft` en memoria y lo materializa al final. Este NO tiene
 * draft: cada paso escribe en la entidad real llamando al MISMO Server Action
 * que usa el modal correspondiente de la app, y después pide `router.refresh()`.
 * El servidor vuelve a leer el estado real y recalcula el progreso. Por eso
 * `done` llega por props (derivado) y no vive en un `useState`: si el usuario
 * crea un sobre en /gastos y vuelve, el asistente ya lo muestra.
 *
 * ── NUNCA ATRAPADO ─────────────────────────────────────────────────────────
 * "Después" está visible en todos los pasos y la navegación nunca se bloquea
 * por validación: un paso incompleto se puede saltar y retomar. Lo que valida
 * es el action, al escribir, y ahí el error se muestra en el propio formulario.
 */

export type SetupSkin = "web" | "mobile";

export type SetupStepDef = {
  id: string;
  /** Etiqueta corta (puntos de progreso / lista del hub). */
  label: string;
  eyebrow: string;
  title: string;
  sub?: string;
  /** Para qué sirve el paso (tooltip "?"). */
  help: string;
  /** Frase de microcelebración al avanzar DESDE este paso, ya resuelto. */
  celebration?: string;
  /** Resuelto según el ESTADO REAL. Derivado en el servidor, nunca local. */
  done: boolean;
  /** Un paso opcional no impide cerrar el asistente. */
  optional?: boolean;
  render: () => React.ReactNode;
};

/** Pantalla de cierre opcional (el encadenado con sentido). */
export type SetupClosing = {
  title: string;
  text: string;
  ctaLabel: string;
  ctaHref: string;
};

const SKIN = {
  web: {
    root: "wiz setup-wiz",
    canvas: "wiz-canvas",
    progress: "wiz-progress",
    bar: "progress-bar",
    fill: "progress-bar-fill",
    progressTxt: "progress-txt",
    frame: "step-frame",
    eyebrow: "step-eyebrow",
    title: "step-title",
    sub: "step-sub",
    foot: "wiz-foot",
    footIn: "wiz-foot-in",
    primary: "btn btn-primary",
    secondary: "btn btn-secondary",
    ghost: "btn btn-ghost",
  },
  mobile: {
    root: "m-wz setup-wiz",
    canvas: "",
    progress: "m-wz-head",
    bar: "bar",
    fill: "",
    progressTxt: "m-wz-progtxt mono",
    frame: "m-wz-body",
    eyebrow: "m-wz-eyebrow",
    title: "m-wz-title",
    sub: "muted",
    foot: "m-wznav",
    footIn: "",
    primary: "m-btn m-btn-primary",
    secondary: "m-btn m-btn-secondary",
    ghost: "m-btn m-btn-secondary",
  },
} as const;

export function SetupWizard({
  steps,
  skin = "web",
  exitHref,
  exitLabel = "Después",
  startIndex = 0,
  closing,
  finishHref,
}: {
  steps: SetupStepDef[];
  skin?: SetupSkin;
  /** A dónde lleva "Después" (y el cierre sin encadenado). */
  exitHref: string;
  exitLabel?: string;
  /** Paso por el que abrir: el primero sin resolver (progreso derivado). */
  startIndex?: number;
  /** Encadenado con sentido al terminar (p. ej. Presupuesto -> Defensa). */
  closing?: SetupClosing | null;
  /** Destino del botón de cierre cuando no hay encadenado. */
  finishHref?: string;
}) {
  const router = useRouter();
  const total = steps.length;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, total - 1)),
  );
  const [showClosing, setShowClosing] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);

  const c = SKIN[skin];
  const step = steps[index];

  // Progreso DERIVADO: cuántos pasos resuelve el estado real, no por dónde va
  // el usuario. Avanzar sin llenar nada no mueve la barra, que es la verdad.
  const doneCount = useMemo(() => steps.filter((s) => s.done).length, [steps]);
  const requiredOpen = useMemo(() => steps.filter((s) => !s.optional && !s.done).length, [steps]);

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), 1150);
    return () => clearTimeout(t);
  }, [celebration]);

  const scrollTop = useCallback(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goNext = () => {
    // La microcelebración premia haber RESUELTO el paso, no haberlo pasado.
    if (step?.done && step.celebration) setCelebration(step.celebration);
    if (index < total - 1) {
      setIndex((i) => i + 1);
      scrollTop();
    } else if (closing) {
      setShowClosing(true);
      scrollTop();
    } else {
      router.push(finishHref ?? exitHref);
    }
  };

  const goBack = () => {
    if (showClosing) return setShowClosing(false);
    if (index > 0) {
      setIndex((i) => i - 1);
      scrollTop();
    }
  };

  if (!step) return null; // total 0: guarda para noUncheckedIndexedAccess

  if (showClosing && closing) {
    return (
      <div className={c.root}>
        <section className={c.frame}>
          <div className={c.eyebrow}>Listo por ahora</div>
          <h1 className={c.title}>{closing.title}</h1>
          <p className={c.sub}>{closing.text}</p>
          <div className="setup-closing-actions">
            <button
              type="button"
              className={c.primary}
              onClick={() => router.push(closing.ctaHref)}
            >
              {closing.ctaLabel}
              <Icon name="chev" width={2.2} />
            </button>
            <button type="button" className={c.secondary} onClick={() => router.push(exitHref)}>
              Ahora no
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={c.root}>
      <div className={c.canvas || undefined}>
        <div className={c.progress}>
          <div className={c.bar}>
            {skin === "mobile" ? (
              <i style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }} />
            ) : (
              <div
                className={c.fill}
                style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
              />
            )}
          </div>
          <div className={c.progressTxt}>
            <span>
              Paso {index + 1} de {total}
            </span>
            <span>
              {doneCount}/{total} configurado
            </span>
          </div>
        </div>

        <section className={c.frame} key={step.id}>
          <div className={c.eyebrow}>{step.eyebrow}</div>
          <div className="setup-title-row">
            <h1 className={c.title} style={{ margin: 0 }}>
              {step.title}
            </h1>
            <HelpTip text={step.help} label={`Para qué sirve: ${step.label}`} />
            {step.done ? (
              <span className="setup-step-done" aria-label="Paso configurado">
                <Icon name="check" width={3} /> Listo
              </span>
            ) : step.optional ? (
              <span className="setup-step-optional">Opcional</span>
            ) : null}
          </div>
          {step.sub ? <p className={c.sub}>{step.sub}</p> : null}
          {step.render()}
        </section>
      </div>

      <div className={c.foot}>
        <div className={c.footIn || undefined}>
          <button
            type="button"
            className={c.secondary}
            onClick={goBack}
            disabled={index === 0}
            style={index === 0 ? { visibility: "hidden" } : undefined}
          >
            Atrás
          </button>

          {/* "Después" SIEMPRE visible: salir no cuesta nada y el progreso ya
              está guardado (cada paso escribe al confirmar, no al terminar). */}
          <button type="button" className={c.ghost} onClick={() => router.push(exitHref)}>
            {exitLabel}
          </button>

          <button type="button" className={c.primary} onClick={goNext}>
            {index === total - 1 ? (requiredOpen > 0 ? "Terminar igual" : "Terminar") : "Continuar"}
            <Icon name="chev" width={2.2} />
          </button>
        </div>
      </div>

      {celebration ? (
        <div className="celebrate show" onClick={() => setCelebration(null)} aria-live="polite">
          <div className="cc">
            <div className="ok">
              <Icon name="check" width={2.6} />
            </div>
            <p>{celebration}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
