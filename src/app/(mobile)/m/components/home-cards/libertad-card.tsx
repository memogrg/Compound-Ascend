import type { PatrimonioReport, Hito } from "@/modules/wealth";
import { MChip, mAmount } from "../content-kit";
import { MHomeCard, MHomeCardEmpty } from "./card-shell";
import { MHomeMeter } from "./meter";

/**
 * Tarjeta "Libertad" del carrusel de Inicio — resumen de la escalera de hitos
 * (Seguridad → Independencia → Libertad). Muestra el HITO ACTUAL (el próximo a
 * conseguir) con su número y progreso, y abre /m/libertad para ver la escalera
 * completa. TODO viene del motor (report): la tarjeta no recalcula nada.
 */

const HITO_LABEL: Record<Exclude<Hito, "ninguno">, string> = {
  seguridad: "Seguridad",
  independencia: "Independencia",
  libertad: "Libertad",
};

export function LibertadCard({
  report: r,
  currency,
}: {
  report: PatrimonioReport;
  currency: string;
}) {
  // Sin nada marcado esencial, el número de seguridad es 0 y la escalera no arranca:
  // se invita a marcar esenciales en Gastos (no un "$0" sin sentido).
  if (r.numeroDeSeguridad <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Libertad"
        icon="goal"
        title="Marca tus gastos esenciales y verás tu primer hito de libertad aquí."
        cta="Marcar esenciales"
        href="/m/gastos"
      />
    );
  }

  const alcanzado = r.hitoAlcanzado !== "ninguno" ? HITO_LABEL[r.hitoAlcanzado] : null;

  // Trabajando hacia el próximo hito: número + progreso del motor.
  if (r.siguienteHito) {
    const numero =
      r.siguienteHito === "seguridad"
        ? r.numeroDeSeguridad
        : r.siguienteHito === "independencia"
          ? r.numeroDeIndependencia
          : (r.numeroDeLibertad ?? 0);
    const progreso =
      r.siguienteHito === "seguridad"
        ? r.progresoSeguridad
        : r.siguienteHito === "independencia"
          ? r.progresoIndependencia
          : r.progresoLibertad;
    return (
      <MHomeCard
        eyebrow="Libertad"
        value={mAmount(numero, currency, 11)}
        chip={alcanzado ? <MChip tone="success">{alcanzado} ✓</MChip> : undefined}
        sub={`Meta actual: ${HITO_LABEL[r.siguienteHito]}`}
        vis={<MHomeMeter pct={progreso} label="hacia tu meta" color="var(--accent)" />}
        message={`Llevas ${mAmount(r.investableWealth, currency)} de capital que trabaja.`}
        href="/m/libertad"
        ariaLabel="Escalera de libertad financiera. Ver detalle"
      />
    );
  }

  // Independencia alcanzada pero sin estilo de vida deseado → invitar a definirlo.
  if (r.numeroDeLibertad == null) {
    return (
      <MHomeCard
        eyebrow="Libertad"
        value={mAmount(r.numeroDeIndependencia, currency, 11)}
        chip={<MChip tone="success">Independencia ✓</MChip>}
        sub="Alcanzaste tu independencia"
        vis={<MHomeMeter pct={1} label="independencia" color="var(--pos)" />}
        message="Define tu estilo de vida para tu último hito →"
        href="/m/libertad"
        ariaLabel="Definir estilo de vida deseado"
      />
    );
  }

  // Los tres hitos alcanzados.
  return (
    <MHomeCard
      eyebrow="Libertad"
      value={mAmount(r.numeroDeLibertad, currency, 11)}
      chip={<MChip tone="success">Libertad ✓</MChip>}
      sub="¡Alcanzaste los tres hitos!"
      vis={<MHomeMeter pct={1} label="libertad" color="var(--pos)" />}
      message="Tu capital sostiene la vida que querés vivir."
      href="/m/libertad"
      ariaLabel="Escalera de libertad financiera. Ver detalle"
    />
  );
}
