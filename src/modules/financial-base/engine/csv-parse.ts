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
 * El monto de una celda, con su signo. `NaN` si no hay número.
 *
 * Por qué no se reutiliza el parser del formulario móvil: la regla NO es la misma, y la
 * diferencia es deliberada. Quien TECLEA «1.500» en un campo puso un punto decimal y
 * quiere 1,5. Un banco que EXPORTA «1.500» quiere mil quinientos. El mismo texto
 * significa cosas distintas según de dónde venga, así que cada contexto lee lo suyo.
 *
 * La regla acá:
 *  · Hay coma Y punto  → el ÚLTIMO es el decimal, el otro es de miles.
 *  · Un solo tipo de separador, una vez, con EXACTAMENTE 3 dígitos detrás → es de miles
 *    («1.500» y «1,500» son 1500). Con 1, 2 o 4+ dígitos → es decimal («1500,50», «1.5»).
 *  · Repetido → de miles («1.500.000»).
 *
 * Antes esto era `Number(raw.replace(/[^0-9.\-]/g, ""))`, que borraba la coma:
 *  · «1500,50»  → 150050    (×100, silencioso)
 *  · «1.500,50» → 1.5005    (÷1000, silencioso)
 * En un formulario la persona ve el número raro antes de guardar. En una importación no
 * lo ve nadie: entra así al historial.
 */
export function montoDeCelda(raw: string): number {
  // El signo se mira ANTES de limpiar. Los paréntesis son notación contable de negativo.
  const negativo = raw.includes("-") || /\(.+\)/.test(raw);
  const limpio = raw.replace(/[^0-9.,]/g, "");
  if (limpio === "") return NaN;

  const comas = (limpio.match(/,/g) ?? []).length;
  const puntos = (limpio.match(/\./g) ?? []).length;
  const ultimo = Math.max(limpio.lastIndexOf(","), limpio.lastIndexOf("."));

  let texto: string;
  if (ultimo === -1) {
    texto = limpio;
  } else {
    const detras = limpio.length - ultimo - 1;
    const unSoloTipo = comas === 0 || puntos === 0;
    const deMiles = unSoloTipo && (comas + puntos > 1 || detras === 3);
    texto = deMiles
      ? limpio.replace(/[.,]/g, "")
      : `${limpio.slice(0, ultimo).replace(/[.,]/g, "")}.${limpio.slice(ultimo + 1)}`;
  }

  const n = Number(texto);
  if (!Number.isFinite(n)) return NaN;
  return negativo ? -n : n;
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
