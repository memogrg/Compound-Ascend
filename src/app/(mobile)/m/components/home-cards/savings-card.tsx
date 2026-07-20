import { MChip } from "../content-kit";
import { MHomeCard, MHomeCardEmpty } from "./card-shell";
import { MHomeMeter } from "./meter";

/** Meta de tasa de ahorro. Es la misma referencia que ya usa el pilar del panel
 *  (`ratio: savingsRate / 0.2`): la tarjeta no inventa un objetivo propio. */
const META_AHORRO = 0.2;

/**
 * Tarjeta 3 — AHORRO.
 *
 * La cifra es la TASA, no el monto: lo que dice si vas bien no es cuánto guardaste sino
 * qué parte de lo que entra logras retener, y es lo único comparable mes a mes cuando el
 * ingreso cambia.
 *
 * `savingsRate` viene de los indicadores base (cero llamadas). Los meses de respaldo
 * salen de richLife, que el panel ya pedía y hasta ahora descartaba.
 */
export function SavingsCard({
  savingsRate,
  monthsOfIndependence,
}: {
  savingsRate: number;
  /** Meses de gastos que cubre el respaldo; null si richLife no trajo el dato. */
  monthsOfIndependence: number | null;
}) {
  if (savingsRate <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Ahorro"
        icon="goal"
        title="Aparta algo cada mes y verás crecer tu respaldo aquí."
        cta="Crea tu primera meta"
        href="/m/metas"
      />
    );
  }

  const meses = monthsOfIndependence;
  return (
    <MHomeCard
      eyebrow="Ahorro"
      value={`${Math.round(savingsRate * 100)}%`}
      chip={
        // Solo cuando hay algo que celebrar: el objetivo ya lo dice la etiqueta del
        // medidor, y ponerlo también aquí era decir "meta 20%" dos veces en la misma
        // tarjeta.
        savingsRate >= META_AHORRO ? <MChip tone="success">En meta</MChip> : undefined
      }
      sub="de tu ingreso mensual"
      vis={
        <MHomeMeter
          pct={savingsRate / META_AHORRO}
          label={`meta ${Math.round(META_AHORRO * 100)}%`}
          color="var(--accent)"
          mostrarPct={false}
        />
      }
      message={
        // Los meses de respaldo son lo que la tasa NO dice: cuánto aguantarías si el
        // ingreso parara. Si richLife no llegó, no se inventa un número.
        meses != null
          ? `Tu respaldo cubre ${meses.toFixed(1)} meses de gastos.`
          : savingsRate >= META_AHORRO
            ? "Mantén el ritmo y tus metas llegan antes."
            : "Subirlo poco a poco fortalece tu fondo de paz."
      }
      href="/m/metas"
      ariaLabel="Tasa de ahorro. Ver metas de ahorro"
    />
  );
}

