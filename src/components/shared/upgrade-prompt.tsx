import { Icon } from "@/components/ui/icon";
import { PREMIUM_BENEFITS } from "@/lib/plan";

/**
 * Upsell ético a Premium. Se muestra DESPUÉS de dar valor (diagnóstico/uso),
 * nunca bloqueando lo esencial. Mensaje claro, sin presión.
 */
export function UpgradePrompt({ compact = false }: { compact?: boolean }) {
  return (
    <div className="prem-card">
      <span className="plan-chip prem" style={{ marginBottom: 14 }}>
        ✦ PREMIUM
      </span>
      <h3>Lleva tu Rich Life más lejos</h3>
      <p className="ps">
        Desbloquea todo el poder de My Agent C+ y deja que la IA trabaje por ti sin límites.
      </p>
      {!compact ? (
        <ul className="prem-ben">
          {PREMIUM_BENEFITS.map((b) => (
            <li key={b}>
              <Icon name="check" width={2.4} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <button className="btn btn-gold" disabled title="Pagos próximamente">
        Mejorar a Premium
      </button>
      <p className="ps" style={{ fontSize: 12, margin: "14px 0 0", opacity: 0.75 }}>
        Tu diagnóstico y tus módulos siempre son gratuitos. Premium suma acompañamiento avanzado
        cuando lo necesites.
      </p>
    </div>
  );
}
