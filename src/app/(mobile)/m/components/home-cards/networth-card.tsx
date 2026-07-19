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
      sub={`Flujo del mes ${flow >= 0 ? "+" : "−"}${mAmount(Math.abs(flow), currency, 8)}`}
      vis={<FlowBars income={income} expense={expense} />}
      message={
        // No repite el patrimonio, que ya está arriba en grande: dice de dónde viene el
        // movimiento del mes, que es lo que la cifra no cuenta.
        dir < 0
          ? "Debes más de lo que tienes."
          : flow >= 0
            ? "Este mes ingresaste más de lo que gastaste."
            : "Este mes gastaste más de lo que ingresaste."
      }
      href="/m/patrimonio"
      ariaLabel="Patrimonio neto. Ver patrimonio"
    />
  );
}

/**
 * Visual de la tarjeta: ingresos vs gastos del mes como dos barras proporcionales.
 *
 * Existe por PARIDAD. Esta tarjeta no tenía nada en la zona del visual y por eso no se
 * parecía a su hermana: dos tarjetas con el mismo chasis pero una con donut y otra con
 * un hueco no se leen como un sistema. Y no cuesta ninguna llamada — son cifras que
 * Inicio ya tenía.
 *
 * La escala es relativa al mayor de los dos, no a una suma: lo que se compara es cuál
 * pesa más, y con una escala absoluta ambas barras se verían casi iguales.
 */
function FlowBars({ income, expense }: { income: number; expense: number }) {
  const max = Math.max(income, expense, 1);
  const alto = (v: number) => Math.max(4, Math.round((v / max) * 44));
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 44 }} aria-hidden>
      <span
        style={{
          width: 16,
          height: alto(income),
          borderRadius: 4,
          background: "var(--accent)",
        }}
      />
      <span
        style={{
          width: 16,
          height: alto(expense),
          borderRadius: 4,
          background: "var(--danger)",
        }}
      />
    </span>
  );
}
