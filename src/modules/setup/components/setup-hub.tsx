import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { setupOverall } from "@/modules/setup/engine/progress";
import type { SetupWizardProgress } from "@/modules/setup/types";

/**
 * HUB de configuración: el acceso a los cuatro asistentes.
 *
 * El estado de cada uno viene del progreso DERIVADO del dato real, así que no
 * puede desincronizarse de la app: si el usuario carga una deuda en /deudas,
 * Control pasa a "en curso" en el siguiente render sin que nadie marque nada.
 *
 * ── EL ACCESO NO DESAPARECE NUNCA ───────────────────────────────────────────
 * El asistente no es solo el alta inicial: también es la puerta para MODIFICAR.
 * Terminar la configuración es justamente cuando se vuelve a entrar a cambiar
 * un monto, así que "ya terminaste" no puede significar "ya no podés volver".
 *
 * Con algo incompleto → tarjeta grande con el progreso y el detalle por paso.
 * Con todo listo → tira compacta y PERMANENTE: "Ajustar mi configuración" más
 * los cuatro con su ✓, cada uno enlazando a su asistente. Antes esa tira vivía
 * dentro de un `<details>`: los enlaces existían, pero había que descubrir el
 * desplegable para verlos. Un acceso que hay que adivinar no es un acceso.
 *
 * De todos modos esta tarjeta NO es el único camino: `/configurar` (y
 * `/m/configurar`) son la entrada estable desde la navegación.
 *
 * Sin estado de cliente: solo `Link`, así que se renderiza en el servidor con
 * el resto de la pantalla.
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
      <section className="setup-hub setup-hub-compact" aria-labelledby="setup-hub-title">
        <div className="setup-hub-compact-head">
          <span className="setup-hub-check">
            <Icon name="check" width={2.6} />
          </span>
          <h3 id="setup-hub-title" className="setup-hub-compact-title">
            Ajustar mi configuración
          </h3>
        </div>
        <div className="setup-hub-chips">
          {progress.map((p) => (
            <Link key={p.id} href={href(p)} className="setup-hub-chip">
              <Icon name="check" width={3} />
              {p.title}
            </Link>
          ))}
        </div>
      </section>
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

/**
 * Los cuatro SIEMPRE en tarjeta grande, sin la variante compacta. Es lo que
 * pinta la pantalla `/configurar`: quien entró ahí ya pidió ver la
 * configuración, así que esconderle el detalle no ayuda.
 */
export function SetupHubFull({
  progress,
  mobile = false,
}: {
  progress: SetupWizardProgress[];
  mobile?: boolean;
}) {
  const href = (p: SetupWizardProgress) => (mobile ? p.mobileHref : p.href);
  return (
    <div className="setup-hub-grid">
      {progress.map((p) => (
        <SetupHubItem key={p.id} p={p} href={href(p)} />
      ))}
    </div>
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
