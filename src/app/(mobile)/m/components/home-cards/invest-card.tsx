import { MChip, mAmount } from "../content-kit";
import { MHomeCard, MHomeCardEmpty, MHomeCardError } from "./card-shell";
import { MHomeMeter } from "./meter";

/**
 * Tarjeta 5 — INVERSIONES.
 *
 * La cifra es lo invertido y el medidor es qué parte del patrimonio PRODUCE ingresos.
 * Son dos cosas distintas a propósito: se puede tener mucho invertido y poco productivo
 * (una casa que no se alquila), y esa brecha es justo lo que la pantalla debe delatar.
 *
 * Cero llamadas: `totalInvested`, el aporte mensual y `productiveAssetsPct` salen de los
 * mismos `wealth`/`richLife` que el panel ya pedía y descartaba.
 */
export function InvestCard({
  totalInvested,
  monthlyContribution,
  productivePct,
  currency,
}: {
  totalInvested: number | null;
  monthlyContribution: number | null;
  /** 0-1: parte del patrimonio que genera ingresos. */
  productivePct: number | null;
  currency: string;
}) {
  if (totalInvested == null || totalInvested <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Inversiones"
        icon="investment"
        title="Pon tu dinero a trabajar y aquí verás cuánto crece."
        cta="Registra una inversión"
        href="/m/inversiones"
      />
    );
  }

  const aporte = monthlyContribution ?? 0;
  return (
    <MHomeCard
      eyebrow="Inversiones"
      value={mAmount(totalInvested, currency, 11)}
      chip={aporte > 0 ? <MChip tone="success">+{mAmount(aporte, currency, 6)}/mes</MChip> : undefined}
      sub="invertido"
      vis={
        // Sin el dato de productividad no se dibuja un medidor a cero, que sugeriría que
        // nada produce. Se cae al aporte, que sí se conoce.
        productivePct != null ? (
          <MHomeMeter pct={productivePct} label="productivo" color="var(--info)" />
        ) : undefined
      }
      message={
        productivePct == null
          ? "Tu dinero invertido trabaja por ti."
          : productivePct >= 0.6
            ? "Casi todo tu patrimonio ya produce."
            : `${Math.round((1 - productivePct) * 100)}% de tu patrimonio no produce.`
      }
      href="/m/inversiones"
      ariaLabel="Total invertido. Ver inversiones"
    />
  );
}

/** El resumen de patrimonio no cargó: distinto de no tener inversiones. */
export function InvestCardError() {
  return <MHomeCardError eyebrow="Inversiones" icon="investment" />;
}
