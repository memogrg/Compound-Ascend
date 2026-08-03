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
import { convertirTotal } from "@/lib/ai/money";
import { parseStatement } from "@/lib/ai/statement-parse";
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
  const { filas, ignoradas } = parseStatement(texto);
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
  const conv = (monto: number, desde: string): string => {
    const c = convertirTotal([{ monto, moneda: desde }], opts.moneda, opts.rates);
    return c ? formatMoney(c.monto, opts.moneda) : formatMoney(monto, desde);
  };

  const cuerpo = filas.map((f) => {
    const signo = f.fila.tipo === "ingreso" ? "+" : "−";
    const estado = f.estado === "registrada" ? "✓ registrada" : "falta";
    return `| ${fechaCorta(f.fila.fecha)} | ${f.fila.comercio} | ${signo}${conv(f.fila.monto, f.fila.moneda)} | ${estado} |`;
  });

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
