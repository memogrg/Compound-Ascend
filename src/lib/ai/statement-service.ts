import "server-only";

/**
 * CONCILIACIÓN DE UN ESTADO DE CUENTA pegado en el chat.
 *
 * Puente entre el parseo/conciliación puros y la BD: lee el rango que cubren las filas, concilia,
 * mapea las FALTANTES a su sobre y arma (a) el reporte en tabla y (b) la propuesta de alta en
 * lote que el usuario confirma con un tap.
 *
 * Solo lectura. El alta la hace `confirmBatchTransactionsAction` después de la confirmación —
 * nada se registra por pegarlo.
 */
import { formatMoney } from "@/lib/format";
import { subtotales } from "@/lib/ai/money";
import { parseStatement, bloqueEsLimpio } from "@/lib/ai/statement-parse";
import { conciliar, rangoDeFilas, type FilaConciliada } from "@/lib/ai/statement-reconcile";
import type { AIActionProposal } from "@/lib/ai/types";
import { logger } from "@/lib/logger";

export type ConciliacionPayload = {
  resumen_md: string;
  /** Propuesta de alta de las faltantes; null si no falta ninguna. */
  action: AIActionProposal | null;
};

/** Fila faltante ya lista para la tarjeta: con su sobre sugerido y su monto en la moneda display. */
export type FaltanteSugerida = {
  kind: "gasto" | "ingreso";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string;
  categoryId: string | null;
  categoryPath: string | null;
};

/**
 * Parseo del bloque: DETERMINISTA como fast-path, LLM para todo lo demás.
 *
 * La decisión es por BLOQUE y no por línea a propósito. Para elegir el monto correcto entre
 * varias columnas hay que VER las otras filas —el saldo se reconoce porque varía poco mientras el
 * monto cambia—, y mandarle al modelo una línea suelta le quita justamente esa señal. Así que:
 * si TODAS las líneas con fecha son limpias (parsean y traen un solo importe), se resuelve sin
 * llamada; si alguna no lo es, el bloque entero va al extractor.
 *
 * Si el LLM no está disponible o no devuelve nada usable, se cae a lo determinista —mejor unas
 * filas leídas que ninguna— y las que no se pudieron leer se listan para que el usuario las mire.
 */
async function parsearBloque(
  texto: string,
): Promise<{ filas: ReturnType<typeof parseStatement>["filas"]; ignoradas: string[] }> {
  const det = parseStatement(texto);
  if (bloqueEsLimpio(texto) && det.ignoradas.length === 0) return det;

  const { extraerConLLM } = await import("@/lib/ai/statement-extract");
  const llm = await extraerConLLM(texto);
  if (!llm) return det; // sin proveedor o respuesta inservible: lo determinista es mejor que nada

  // El LLM leyó el bloque entero: sus filas mandan. Solo se reportan como ilegibles las líneas
  // que TAMPOCO él pudo convertir en movimiento — y se listan, no se cuentan nada más.
  const ignoradas = llm.length >= det.filas.length ? [] : det.ignoradas;
  return { filas: llm, ignoradas };
}

/** Etiqueta de fecha corta y estable (no depende del locale del server). */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[(m ?? 1) - 1] ?? ""}`;
}

/**
 * Concilia el bloque pegado. `moneda` es la de VISUALIZACIÓN: los montos del estado vienen en la
 * del banco (COL→CRC) y se muestran convertidos, igual que el resto del chat.
 */
export async function conciliarEstado(
  texto: string,
  moneda: string,
): Promise<ConciliacionPayload | null> {
  const { filas, ignoradas } = await parsearBloque(texto);
  const rango = rangoDeFilas(filas);
  if (filas.length === 0 || !rango) return null;

  const { listTransactions } = await import("@/modules/financial-base");
  const { getFxRates } = await import("@/lib/market-data/fx-rates");

  const [y, m] = rango.from.split("-").map(Number);
  const period = { month: m ?? 1, year: y ?? 1970, from: rango.from, to: rango.to, label: "" };
  const registradas = await listTransactions(period).catch(() => []);
  const rates = await getFxRates().catch(() => null);

  const r = conciliar(filas, registradas);

  // Sobre sugerido SOLO para las faltantes: es lo único que se va a registrar, y cada llamada
  // puede pegarle al LLM de categorización. Secuencial y no en paralelo para no disparar N
  // llamadas simultáneas con un pegado grande.
  const faltantes: FaltanteSugerida[] = [];
  const { suggestSobreForChat } = await import("@/modules/financial-base");
  for (const f of r.filas) {
    if (f.estado !== "faltante") continue;
    let categoryId: string | null = null;
    let categoryPath: string | null = null;
    try {
      const sug = await suggestSobreForChat(f.fila.comercio, f.fila.tipo);
      categoryId = sug.categoryId;
      categoryPath = sug.categoryPath;
    } catch (err) {
      // Sin sobre sugerido la fila sigue: la tarjeta la ofrece con el selector en "Sin sobre".
      logger.warn("conciliarEstado: sugerencia de sobre falló", {
        message: err instanceof Error ? err.message : "?",
      });
    }
    faltantes.push({
      kind: f.fila.tipo,
      description: f.fila.comercio,
      amount: f.fila.monto,
      currency: f.fila.moneda,
      occurredOn: f.fila.fecha,
      categoryId,
      categoryPath,
    });
  }

  return {
    resumen_md: renderReporte(r.filas, { moneda, rates, ignoradas: ignoradas.length }),
    action:
      faltantes.length > 0
        ? {
            type: "create_transactions_batch",
            payload: { rows: faltantes },
            summary: `Registrar ${faltantes.length} ${faltantes.length === 1 ? "movimiento" : "movimientos"}`,
          }
        : null,
  };
}

/**
 * Reporte en TABLA. Los montos van en la moneda de visualización; si falta la tasa de alguna, esa
 * fila se muestra en su moneda de origen antes que inventar la conversión.
 */
export function renderReporte(
  filas: FilaConciliada[],
  opts: { moneda: string; rates: Record<string, number> | null; ignoradas: number },
): string {
  // MONEDA NATIVA: cada movimiento en la moneda en que se gastó, como en las listas del libro
  // diario. Acá pesa todavía más que allá — el usuario está comparando fila por fila contra un
  // estado de cuenta que dice ₡3.900; verlo como $7,80 vuelve imposible el cotejo, que es
  // literalmente para lo que pegó el bloque.
  const cuerpo = filas.map((f) => {
    const signo = f.fila.tipo === "ingreso" ? "+" : "−";
    const estado = f.estado === "registrada" ? "✓ registrada" : "falta";
    return `| ${fechaCorta(f.fila.fecha)} | ${f.fila.comercio} | ${signo}${formatMoney(f.fila.monto, f.fila.moneda)} | ${estado} |`;
  });

  // Total del bloque en la moneda de los movimientos; con varias, subtotal por moneda.
  const montos = filas.map((f) => ({ monto: f.fila.monto, moneda: f.fila.moneda }));
  const monedas = new Set(montos.map((m) => m.moneda));
  const total =
    monedas.size === 1
      ? formatMoney(
          montos.reduce((a, m) => a + m.monto, 0),
          [...monedas][0]!,
        )
      : subtotales(montos)
          .map((m) => formatMoney(m.monto, m.moneda))
          .join(" + ");
  cuerpo.push(`| **Total** |  | **${total}** |  |`);

  const registradas = filas.filter((f) => f.estado === "registrada").length;
  const faltantes = filas.length - registradas;
  const resumen =
    faltantes === 0
      ? `Revisé ${filas.length} ${filas.length === 1 ? "movimiento" : "movimientos"}: **están todos registrados**.`
      : `De ${filas.length} movimientos, **${registradas} ya ${registradas === 1 ? "está" : "están"}** y **${faltantes} ${faltantes === 1 ? "falta" : "faltan"}**.`;

  const nota =
    opts.ignoradas > 0
      ? `\n\n(No pude leer ${opts.ignoradas} ${opts.ignoradas === 1 ? "línea" : "líneas"} del pegado; revisalas aparte.)`
      : "";

  const cierre = faltantes > 0 ? "\n\nPodés registrar las que faltan de una, con el sobre que les puse:" : "";

  return [
    resumen,
    "",
    "| Fecha | Comercio | Monto | Estado |",
    "| --- | --- | --- | --- |",
    ...cuerpo,
  ].join("\n") + nota + cierre;
}
