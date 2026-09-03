import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { PLAN_BENEFITS, PLAN_LABEL, PLAN_PRICE_USD, type Plan } from "@/lib/plan";

/**
 * Upsell hacia el siguiente escalón. Aparece DESPUÉS de dar valor, nunca
 * bloqueando lo esencial.
 *
 * Muestra lo que suma el plan siguiente, no un catálogo: quien está en Esencial+
 * necesita saber qué gana con Pro+, no volver a leer lo que ya tiene. En Max+ no
 * se muestra nada — no hay a dónde subir y seguir empujando sería ruido.
 */
const SIGUIENTE: Record<Plan, Exclude<Plan, "ninguno"> | null> = {
  ninguno: "esencial",
  esencial: "pro",
  pro: "max",
  max: null,
};

export function UpgradePrompt({
  plan = "ninguno",
  compact = false,
}: {
  plan?: Plan;
  compact?: boolean;
}) {
  const destino = SIGUIENTE[plan];
  if (!destino) return null;

  return (
    <div className="prem-card">
      <span className="plan-chip prem" style={{ marginBottom: 14 }}>
        {PLAN_LABEL[destino].toUpperCase()}
      </span>
      <h3>Llevá tu acompañamiento más lejos</h3>
      <p className="ps">
        Lo que cambia entre planes es la profundidad con la que My Agent C+ puede conocerte,
        recordar tu historia y acompañar tus decisiones.
      </p>
      {!compact ? (
        <ul className="prem-ben">
          {PLAN_BENEFITS[destino].map((b) => (
            <li key={b}>
              <Icon name="check" width={2.4} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Link className="btn btn-gold" href="/suscripcion">
        Pasar a {PLAN_LABEL[destino]} · ${PLAN_PRICE_USD[destino]}/mes
      </Link>
      <p className="ps" style={{ fontSize: 12, margin: "14px 0 0", opacity: 0.75 }}>
        Al subir, el cambio entra de una. Al bajar, seguís con tu plan hasta que venza el mes ya
        pagado.
      </p>
    </div>
  );
}
