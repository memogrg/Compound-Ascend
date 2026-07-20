import { MChip, mAmount } from "../content-kit";
import { MHomeCard, MHomeCardEmpty } from "./card-shell";
import { MHomeMeter } from "./meter";

/** Umbral de carga de deuda sobre el ingreso. Es la misma referencia que ya usa el
 *  pilar del panel (`ratio: debtWeight / 0.4`). */
const LIMITE_DEUDA = 0.4;

/**
 * Tarjeta 4 — DEUDAS.
 *
 * La cifra es la CARGA sobre el ingreso, no el saldo. El saldo dice cuánto debes; la
 * carga dice si puedes con ello, que es lo que decide si duermes tranquilo. Además es
 * neutra a la moneda, así que no engaña en una cartera mixta.
 *
 * `debtWeight` viene de los indicadores base: cero llamadas.
 */
export function DebtCard({
  debtWeight,
  totalLiabilities,
  currency,
}: {
  /** 0-1: cuota mensual de deuda sobre el ingreso mensual. */
  debtWeight: number;
  /** Saldo total; null si richLife no llegó. Va en el subtexto, no en la cifra. */
  totalLiabilities: number | null;
  currency: string;
}) {
  if (debtWeight <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Deudas"
        icon="debt"
        title="No tienes deudas registradas. Si aparece alguna, aquí verás cuánto pesa."
        cta="Registrar una deuda"
        href="/m/deudas"
      />
    );
  }

  const holgado = debtWeight < 0.3;
  return (
    <MHomeCard
      eyebrow="Deudas"
      value={`${Math.round(debtWeight * 100)}%`}
      chip={
        debtWeight >= LIMITE_DEUDA ? (
          <MChip tone="danger">Sobre el límite</MChip>
        ) : holgado ? (
          <MChip tone="success">Manejable</MChip>
        ) : (
          <MChip tone="warning">Ajustado</MChip>
        )
      }
      sub={
        // Corto por obligación: a 320px esta línea solo dispone de ~128px, y decir de
        // QUÉ es el porcentaje importa más que repetir el saldo.
        totalLiabilities != null ? `de tu ingreso · ${mAmount(totalLiabilities, currency, 6)}` : "de tu ingreso mensual"
      }
      vis={
        <MHomeMeter
          pct={debtWeight / LIMITE_DEUDA}
          label={`límite ${Math.round(LIMITE_DEUDA * 100)}%`}
          color={debtWeight >= LIMITE_DEUDA ? "var(--danger)" : "var(--warning)"}
          marca={1}
          mostrarPct={false}
        />
      }
      message={
        // Aporta la consecuencia, que es lo que el porcentaje no cuenta.
        debtWeight >= LIMITE_DEUDA
          ? "Aprieta tu presupuesto cada mes."
          : holgado
            ? "Evita sumar deuda cara y sigue así."
            : "Bajarla te devuelve margen."
      }
      href="/m/deudas"
      ariaLabel="Carga de deuda sobre el ingreso. Ver deudas"
    />
  );
}

