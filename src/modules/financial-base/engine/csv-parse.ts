/**
 * Parser puro de CSV bancario (sin dependencias: solo strings). Lo comparten el modal de la web
 * (components/v2/csv-import-modal.tsx) y la pantalla móvil (/m/transacciones), para que ambas
 * lean exactamente los mismos archivos con las mismas reglas.
 *
 * Columnas reconocidas (flexible, por coincidencia parcial en la cabecera):
 * fecha/date, descripcion/comercio/concepto/detalle/description/merchant, monto/amount/importe/
 * valor, tipo/kind (ingreso|gasto), moneda/currency. Si no hay 'tipo', el signo del monto decide
 * (negativo = gasto). Las filas sin fecha válida o sin monto se omiten (skipped).
 *
 * Delimitador: se detecta de la cabecera (`,` o `;`). Los bancos de la región usan `;`
 * porque la coma es el separador decimal.
 *
 * Montos: ver `montoDeCelda`. La coma decimal se entiende; antes se borraba y «1500,50»
 * entraba como 150050.
 *
 * Las filas resultantes se validan de nuevo en el servidor con csvTxnSchema
 * (importTransactionsAction) — este parser NO es la capa de seguridad.
 */
import { parseMonto } from "@/lib/parse-monto";

export type ParsedCsvRow = {
  kind: "ingreso" | "gasto";
  amount: number;
  occurredOn: string;
  description?: string;
  currency: string;
};

/**
 * Delimitador del archivo. Los bancos de la región exportan con punto y coma,
 * precisamente PORQUE la coma es el separador decimal: un archivo con «1500,50» y
 * delimitador coma se parte en dos celdas y el monto llega mutilado.
 *
 * Se decide por la cabecera y no por todo el archivo: es una sola línea, no tiene
 * montos, y si ahí hay más «;» que «,» no hay ambigüedad posible.
 */
export function detectarDelimitador(header: string): string {
  const puntoYComa = (header.match(/;/g) ?? []).length;
  const coma = (header.match(/,/g) ?? []).length;
  return puntoYComa > coma ? ";" : ",";
}

/** Separa una línea CSV respetando comillas dobles ("a,b" es una sola celda; "" escapa la comilla). */
export function splitLine(line: string, delimiter: string = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === delimiter) {
      out.push(cur);
      cur = "";
    } else if (c === '"') q = true;
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Minúsculas sin acentos, para comparar cabeceras ("Descripción" → "descripcion"). */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Acepta YYYY-MM-DD y DD/MM/YYYY; cualquier otro formato se descarta. */
export function normalizeDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

/**
 * El monto de una celda, con su signo. `NaN` si no hay número — `parseCsv` usa ese NaN
 * para contar la fila como omitida, así que se conserva en vez de propagar `undefined`.
 *
 * La regla vive en `@/lib/parse-monto`, una sola para todo el repositorio. Este envoltorio
 * existe solo para el contrato del engine: los callers no cambian.
 */
export function montoDeCelda(raw: string): number {
  return parseMonto(raw) ?? NaN;
}

export function parseCsv(
  text: string,
  defaultCurrency: string,
): { rows: ParsedCsvRow[]; skipped: number } {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], skipped: 0 };
  const delimiter = detectarDelimitador(lines[0]!);
  const header = splitLine(lines[0]!, delimiter).map(norm);
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = idx(["fecha", "date"]);
  const iDesc = idx(["descripcion", "comercio", "concepto", "detalle", "description", "merchant"]);
  const iAmt = idx(["monto", "amount", "importe", "valor"]);
  const iKind = idx(["tipo", "kind"]);
  const iCur = idx(["moneda", "currency"]);

  const rows: ParsedCsvRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!, delimiter);
    const rawAmt = (iAmt >= 0 ? cells[iAmt] : "") ?? "";
    const num = montoDeCelda(rawAmt);
    const date = iDate >= 0 ? normalizeDate(cells[iDate] ?? "") : null;
    if (!Number.isFinite(num) || num === 0 || !date) {
      skipped++;
      continue;
    }
    let kind: "ingreso" | "gasto";
    const kindCell = iKind >= 0 ? norm(cells[iKind] ?? "") : "";
    if (kindCell.includes("ingres") || kindCell.includes("income")) kind = "ingreso";
    else if (kindCell.includes("gast") || kindCell.includes("expense")) kind = "gasto";
    else kind = num < 0 ? "gasto" : "ingreso";
    rows.push({
      kind,
      amount: Math.abs(num),
      occurredOn: date,
      description: iDesc >= 0 ? cells[iDesc] || undefined : undefined,
      currency: (iCur >= 0 ? cells[iCur]?.toUpperCase().slice(0, 3) : "") || defaultCurrency,
    });
  }
  return { rows, skipped };
}
