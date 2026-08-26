import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { setupOverall } from "@/modules/setup/engine/progress";
import type { SetupWizardProgress } from "@/modules/setup/types";

/**
 * HUB de configuración: la tarjeta del panel con los cuatro asistentes.
 *
 * El estado de cada uno viene del progreso DERIVADO del dato real, así que la
 * tarjeta no puede desincronizarse de la app: si el usuario carga una deuda en
 * /deudas, Control pasa a "en curso" en el siguiente render sin que nadie
 * marque nada.
 *
 * Cuando los cuatro están listos NO desaparece: se colapsa a un acceso discreto.
 * El asistente también sirve para MODIFICAR la configuración, y esconderlo del
 * todo obligaría a buscar la pantalla exacta de cada dato.
 *
 * Sin estado de cliente: `<details>` da el colapso y `Link` la navegación, así
 * que el hub se renderiza en el servidor con el resto del panel.
 */
export function SetupHub({
  progress,
  mobile = false,
}: {
  progress: SetupWizardProgress[];
  mobile?: boolean;
}) {
  const { done, total, allReady } = setupOverall(progress);
  const href = (p: SetupWizardProgress) => (mobile ? p.mobileHref : p.href);

  if (allReady) {
    return (
      <details className="setup-hub setup-hub-collapsed">
        <summary>
          <span className="setup-hub-check">
            <Icon name="check" width={2.6} />
          </span>
          <span>Tu configuración está completa</span>
          <span className="setup-hub-hint">Modificar</span>
        </summary>
        <div className="setup-hub-grid">
          {progress.map((p) => (
            <SetupHubItem key={p.id} p={p} href={href(p)} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <section className="setup-hub" aria-labelledby="setup-hub-title">
      <div className="setup-hub-head">
        <div>
          <div className="setup-hub-eyebrow">Configuración</div>
          <h3 id="setup-hub-title" className="setup-hub-title">
            Terminá de armar tu sistema
          </h3>
        </div>
        <div className="setup-hub-count">
          {done}/{total} listos
        </div>
      </div>
      <div className="setup-hub-grid">
        {progress.map((p) => (
          <SetupHubItem key={p.id} p={p} href={href(p)} />
        ))}
      </div>
    </section>
  );
}

function SetupHubItem({ p, href }: { p: SetupWizardProgress; href: string }) {
  const cta = p.status === "listo" ? "Modificar" : p.status === "en_curso" ? "Seguir" : "Empezar";
  return (
    <Link href={href} className={cn("setup-hub-item", p.status)}>
      <div className="setup-hub-item-top">
        <span className="setup-hub-icon">
          <Icon name={p.icon as IconName} width={2} />
        </span>
        <span className="setup-hub-item-name">{p.title}</span>
        {p.status === "listo" ? (
          <span className="setup-hub-badge ok">
            <Icon name="check" width={3} /> Listo
          </span>
        ) : (
          <span className="setup-hub-badge">
            {p.done}/{p.total}
          </span>
        )}
      </div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${p.total > 0 ? (p.done / p.total) * 100 : 0}%` }}
        />
      </div>
      <ul className="setup-hub-steps">
        {p.steps.map((s) => (
          <li key={s.id} className={cn(s.done && "done")}>
            <span className="setup-hub-dot" aria-hidden />
            <span className="setup-hub-step-label">{s.label}</span>
            <span className="setup-hub-step-detail">{s.detail}</span>
          </li>
        ))}
      </ul>
      <span className="setup-hub-cta">
        {cta} <Icon name="chev" width={2.4} />
      </span>
    </Link>
  );
}
