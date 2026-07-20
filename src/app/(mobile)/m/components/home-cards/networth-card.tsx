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
 *
 * El desglose activos/deudas tampoco cuesta una llamada: lo calcula el mismo indicador
 * que ya devuelve el patrimonio neto, y hasta ahora simplemente se descartaba antes de
 * llegar a la vista.
 */
export function NetWorthCard({
  netWorth,
  velocity,
  assets,
  liabilities,
  currency,
}: {
  netWorth: number | null;
  /** Cambio del mes; null si no hay serie para calcularlo. */
  velocity: number | null;
  /** De qué está hecho el patrimonio neto. Los calcula el mismo indicador que da
   *  `netWorth`, así que llegan sin ninguna llamada añadida. */
  assets: number | null;
  liabilities: number | null;
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

  // Objeto en vez de booleano: así TypeScript estrecha los dos números a la vez y el
  // resto del componente los usa sin volver a comprobar que no son null.
  const desglose = assets != null && liabilities != null ? { assets, liabilities } : null;

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
      // Sin `sub`: las cifras van DENTRO del gráfico, pegadas a su barra. Ponerlas aquí
      // como "Activos X · Deudas Y" pedía 220px y la línea nunca pasa de 180 ni a 375px,
      // así que se habría recortado siempre — y una leyenda a medias es peor que ninguna.
      vis={desglose ? <AssetsVsDebts {...desglose} currency={currency} /> : undefined}
      message={
        // No repite el patrimonio, que ya está arriba en grande: dice qué relación hay
        // entre las dos piezas que lo forman, que es lo que la cifra no cuenta.
        dir < 0
          ? "Debes más de lo que tienes."
          : !desglose
            ? "Tu patrimonio es lo que tienes menos lo que debes."
            : desglose.liabilities === 0
              ? "No tienes deudas registradas."
              : // Sin "Tienes": el mensaje es de una línea con elipsis y a 320px solo
                // caben ~218px. Con el verbo delante pedía 255 y se cortaba justo en la
                // cifra, que es la única parte que importa.
                `${(desglose.assets / desglose.liabilities).toFixed(1)}× más activos que deudas.`
      }
      href="/m/patrimonio"
      ariaLabel="Patrimonio neto. Ver patrimonio"
    />
  );
}

/**
 * Visual de la tarjeta: ACTIVOS vs DEUDAS, que es literalmente de qué está hecho el
 * patrimonio neto.
 *
 * Sustituye a unas barras de ingresos vs gastos del mes que tenían dos problemas. El
 * de forma: iban sin etiqueta ni escala, y hubo que preguntar qué eran. El de fondo,
 * peor: mostraban FLUJO en una tarjeta que habla de PATRIMONIO — el visual no
 * correspondía al tema. Un gráfico correcto del asunto equivocado sigue siendo un
 * gráfico equivocado.
 *
 * Sin coste: ambas cifras las calcula el mismo indicador que ya da el patrimonio neto.
 *
 * La escala es relativa al mayor de los dos, no a la suma: lo que se compara es cuánto
 * pesa uno frente al otro, y contra la suma las dos barras se aplastarían.
 */
function AssetsVsDebts({
  assets,
  liabilities,
  currency,
}: {
  assets: number;
  liabilities: number;
  currency: string;
}) {
  const max = Math.max(assets, liabilities, 1);
  // Mínimo de 3px: una deuda pequeña pero real no puede desaparecer del gráfico.
  const alto = (v: number) => Math.max(3, Math.round((v / max) * ALTO_BARRA));
  return (
    <span className="m-hcard-bars">
      <Barra label="Activos" cifra={mAmount(assets, currency, 6)} alto={alto(assets)} color="var(--accent)" />
      <Barra label="Deudas" cifra={mAmount(liabilities, currency, 6)} alto={alto(liabilities)} color="var(--danger)" />
    </span>
  );
}

const ALTO_BARRA = 34;

/** Cada barra lleva SU etiqueta y SU cifra debajo. Nada de leyenda aparte: obligaría a
 *  mirar a otro sitio y emparejar por color, que es el paso que hizo falta explicar. */
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
      <span style={{ height: ALTO_BARRA, display: "flex", alignItems: "flex-end" }} aria-hidden>
        <span style={{ width: 18, height: alto, borderRadius: 4, background: color }} />
      </span>
      <span className="m-hcard-bar-l">{label}</span>
      <span className="m-hcard-bar-v">{cifra}</span>
    </span>
  );
}
