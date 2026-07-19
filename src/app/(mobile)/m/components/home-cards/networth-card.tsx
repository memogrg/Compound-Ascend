import { formatMoney } from "@/lib/format";

import { MChip, mAmount } from "../content-kit";
import { MHomeCard, MHomeCardEmpty } from "./card-shell";

/**
 * Tarjeta 7 — PATRIMONIO. Entra ya en la Fase 1 porque conserva exactamente lo que
 * hoy muestra el hero (patrimonio neto + velocidad del mes) y esos datos YA los carga
 * Inicio: coste añadido cero. Sustituir el hero sin ella habría dejado la pantalla sin
 * el dato que lleva enseñando desde siempre.
 *
 * Sirve además para validar el chasis con dos dominios distintos en vez de uno: un
 * sistema que solo se ha probado con una instancia todavía no está probado.
 */
export function NetWorthCard({
  netWorth,
  velocity,
  income,
  expense,
  flow,
  currency,
}: {
  netWorth: number | null;
  /** Cambio del mes; null si no hay serie para calcularlo. */
  velocity: number | null;
  /** Las tres cifras del mes que el hero ya mostraba. En Fase 2 esta tarjeta pasa a
   *  activos vs pasivos, que es lo que pide la especificación — pero eso exige un
   *  dato que getDashboardData hoy no expone, y no vale añadir una llamada a Inicio
   *  por un cambio visual. */
  income: number;
  expense: number;
  flow: number;
  currency: string;
}) {
  if (netWorth == null) {
    return (
      <MHomeCardEmpty
        eyebrow="Patrimonio"
        icon="household"
        title="Registra lo que tienes y lo que debes para ver tu patrimonio crecer."
        cta="Registra tu patrimonio"
        href="/m/patrimonio"
      />
    );
  }

  // 0 no es ni positivo ni negativo: sin signo y en neutro (misma regla que el resto
  // de la app). El signo del negativo lo pone el formateador central.
  const dir = netWorth > 0 ? 1 : netWorth < 0 ? -1 : 0;
  const velDir = velocity == null ? 0 : velocity > 0 ? 1 : velocity < 0 ? -1 : 0;


  return (
    <MHomeCard
      eyebrow="Patrimonio"
      value={mAmount(netWorth, currency, 11)}
      chip={
        // Sin serie no se inventa una flecha: la comparación mes a mes no existe de
        // forma uniforme en los servicios (Parte 1.5 de la especificación).
        velocity != null && velDir !== 0 ? (
          <MChip tone={velDir > 0 ? "success" : "danger"}>
            {velDir > 0 ? "+" : "−"}
            {mAmount(Math.abs(velocity), currency, 7)} mes
          </MChip>
        ) : undefined
      }
      slot={
        // Las tres cifras del mes, tal como estaban en el hero.
        <span style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <Mini label="Ingresos" value={mAmount(income, currency, 8)} cls="pos" />
          <Mini label="Gastos" value={mAmount(expense, currency, 8)} cls="neg" />
          <Mini label="Flujo" value={mAmount(flow, currency, 8)} cls={flow >= 0 ? "pos" : "neg"} />
        </span>
      }
      message={
        dir < 0
          ? "Debes más de lo que tienes. Reducir pasivos es la prioridad."
          : `Lo que tienes menos lo que debes, hoy: ${formatMoney(netWorth, currency)}.`
      }
      href="/m/patrimonio"
      ariaLabel="Patrimonio neto. Ver patrimonio"
    />
  );
}

/** Cifra pequeña con su rótulo, para el pie de la tarjeta de patrimonio. */
function Mini({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span className="muted" style={{ fontSize: 10 }}>
        {label}
      </span>
      <span className={`mono ${cls}`} style={{ fontSize: 12.5, fontWeight: 700 }}>
        {value}
      </span>
    </span>
  );
}
