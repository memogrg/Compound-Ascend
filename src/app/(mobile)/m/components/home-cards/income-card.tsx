import { MChip, mAmount } from "../content-kit";
import { MHomeCard, MHomeCardEmpty } from "./card-shell";

/**
 * Tarjeta 2 — INGRESOS.
 *
 * Es de ingresos PUROS, no del "flujo del mes" que trae el pilar. El pilar `flujo` es
 * ingresos menos gastos, y el carrusel ya tiene a Presupuesto hablando de lo que se va:
 * dos tarjetas contestando "cuánto me queda" se pisarían. Ingresos contesta lo que
 * ninguna otra contesta —cuánto entra y de dónde— y además es lo que se pidió.
 *
 * El desglose activo/pasivo no es decorativo: la tesis de la app es que la libertad
 * llega cuando el ingreso pasivo cubre los gastos, así que ver cuánto de lo que entra
 * trabaja solo es el dato que mueve la aguja.
 *
 * Cero llamadas: `incomeMonthly` e `incomeByType` ya vienen en los indicadores base.
 */
export function IncomeCard({
  incomeMonthly,
  activo,
  pasivo,
  currency,
}: {
  incomeMonthly: number;
  activo: number;
  pasivo: number;
  currency: string;
}) {
  if (incomeMonthly <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Ingresos"
        icon="income"
        title="Registra lo que entra cada mes y sabrás con cuánto cuentas de verdad."
        cta="Registra tus ingresos"
        href="/m/ingresos"
      />
    );
  }

  const pctPasivo = incomeMonthly > 0 ? pasivo / incomeMonthly : 0;

  return (
    <MHomeCard
      eyebrow="Ingresos"
      value={mAmount(incomeMonthly, currency, 11)}
      chip={
        pasivo > 0 ? (
          <MChip tone="success">{Math.round(pctPasivo * 100)}% pasivo</MChip>
        ) : undefined
      }
      vis={<IncomeSplit activo={activo} pasivo={pasivo} currency={currency} />}
      message={
        // Aporta lo que la cifra no dice: de dónde viene, no cuánto es.
        pasivo <= 0
          ? "Todo depende de tu trabajo."
          : pctPasivo >= 0.5
            ? "Más de la mitad trabaja sola."
            : "Los ingresos pasivos te acercan."
      }
      href="/m/ingresos"
      ariaLabel="Ingresos del mes. Ver ingresos"
    />
  );
}

const ALTO = 34;

/**
 * Activo vs pasivo como dos barras etiquetadas, misma forma que el desglose de
 * Patrimonio: las dos tarjetas comparan DOS MAGNITUDES, así que comparten gráfico. Dar
 * formas distintas a la misma idea obligaría a reaprenderla.
 *
 * La escala es relativa al mayor, no a la suma: lo que se compara es cuál pesa más.
 */
function IncomeSplit({
  activo,
  pasivo,
  currency,
}: {
  activo: number;
  pasivo: number;
  currency: string;
}) {
  const max = Math.max(activo, pasivo, 1);
  // Suelo de 13px: por debajo, una barra de 16 de ancho es más ancha que alta y se lee
  // como un guion. La cifra exacta va impresa debajo, así que la barra solo da relación.
  const alto = (v: number) => Math.max(13, Math.round((v / max) * ALTO));
  return (
    <span className="m-hcard-bars">
      <Barra label="Activo" cifra={mAmount(activo, currency, 6)} alto={alto(activo)} color="var(--accent)" />
      <Barra label="Pasivo" cifra={mAmount(pasivo, currency, 6)} alto={alto(pasivo)} color="var(--info)" />
    </span>
  );
}

function Barra({
  label,
  cifra,
  alto,
  color,
}: {
  label: string;
  cifra: string;
  alto: number;
  color: string;
}) {
  return (
    <span className="m-hcard-bar">
      <span style={{ height: ALTO, display: "flex", alignItems: "flex-end" }} aria-hidden>
        <span style={{ width: 16, height: alto, borderRadius: 4, background: color }} />
      </span>
      <span className="m-hcard-bar-l">{label}</span>
      <span className="m-hcard-bar-v">{cifra}</span>
    </span>
  );
}

