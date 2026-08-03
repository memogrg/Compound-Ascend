import { escapeHtml } from "@/lib/security/escape-html";

/**
 * Convierte el subconjunto de Markdown que produce el asesor (negritas, cursivas, viñetas,
 * subtítulos, enlaces, TABLAS) a HTML SEGURO para inyectar con dangerouslySetInnerHTML.
 *
 * SEGURIDAD — por qué no hace falta un sanitizador externo:
 *  - Se ESCAPA todo el input con escapeHtml() ANTES de transformar. El modelo NO puede inyectar
 *    HTML: un "<script>" del modelo entra como "&lt;script&gt;" y jamás se ejecuta; un
 *    'onclick="…"' queda como texto escapado.
 *  - El output solo contiene las etiquetas que ESTE módulo genera (allowlist cerrado:
 *    p, br, strong, em, ul, li, h3, a, div, table, thead, tbody, tr, th, td). No reintroducimos
 *    HTML del input en ningún punto — las tablas se construyen desde las CELDAS ya escapadas,
 *    nunca pegando markup que venga del modelo.
 *  - Los atributos que emitimos (class, href) los pone este módulo. El único que depende del
 *    input es href, restringido a http(s); cualquier otro esquema (javascript:, data:) se deja
 *    como texto literal, y el valor ya viene escapado, así que no puede romper el atributo.
 *
 * Elegí un conversor propio (no marked+DOMPurify) porque: (1) el asesor emite un markdown
 * acotado, (2) evita dos dependencias nuevas y el riesgo del lockfile de CI, y (3) escapar-
 * primero + allowlist de solo-salida es una superficie de ataque nula (nunca parseamos HTML).
 */

const ALLOWED_LINK = /^https?:\/\//i;

/** Formato inline sobre texto YA escapado. Solo produce strong/em/a. */
function inline(escaped: string): string {
  let s = escaped;
  // Enlaces [texto](url): solo http(s); si no, se deja el markdown literal.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, url: string) =>
    ALLOWED_LINK.test(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : whole,
  );
  // Negrita (**) antes que cursiva (*) para no romper los dobles asteriscos.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  return s;
}

// ----------------------------------------------------------------------------
// Tablas
// ----------------------------------------------------------------------------

/** Fila de guiones que confirma que la línea anterior era el encabezado: | --- | ---: | */
const TABLE_SEP_CELL = /^:?-{2,}:?$/;

/**
 * Celda que es un NÚMERO (monto, porcentaje, cantidad, plazo). Decide la alineación a la
 * DERECHA cuando el modelo no marcó alineación en la fila de guiones — que es lo normal.
 * Alinear los números es lo que hace comparable una columna de un vistazo.
 */
const NUMERIC_CELL = /^[-+−]?\s*[₡$€£]?\s*\d[\d.,\s]*\s*(%|[A-Za-zÁÉÍÓÚÑáéíóúñ]{1,6})?$/;

type Align = "" | "r" | "c";

/** Parte una fila `| a | b |` en celdas, tolerando que falten los pipes de los extremos. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** ¿Es la fila de guiones de una tabla? Todas sus celdas tienen que serlo. */
function isSeparatorRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => TABLE_SEP_CELL.test(c));
}

/** Alineación declarada en la fila de guiones (`:-:` centro, `--:` derecha). "" = sin declarar. */
function alignFromSeparator(cell: string): Align {
  const izq = cell.startsWith(":");
  const der = cell.endsWith(":");
  if (izq && der) return "c";
  if (der) return "r";
  return "";
}

/** Quita el énfasis markdown para poder mirar si la celda es un número (**1.234** → 1.234). */
function bare(cell: string): string {
  return cell.replace(/[*_]/g, "").trim();
}

/** Celda de tabla ya escapada → <th>/<td> con su clase de alineación. */
function cell(tag: "th" | "td", content: string, align: Align): string {
  const cls = align ? ` class="md-${align}"` : "";
  return `<${tag}${cls}>${inline(content)}</${tag}>`;
}

/**
 * Construye la tabla desde filas YA ESCAPADAS. Las columnas que el modelo no alineó y cuyo
 * cuerpo es numérico se alinean a la derecha solas. Las filas con más o menos celdas que el
 * encabezado se recortan/rellenan: una tabla torcida se ve mal, pero no debe romper el render.
 */
function buildTable(header: string[], seps: string[], body: string[][]): string {
  const cols = header.length;
  const aligns: Align[] = header.map((_, i) => {
    const declarada = alignFromSeparator(seps[i] ?? "");
    if (declarada) return declarada;
    const columna = body.map((r) => bare(r[i] ?? "")).filter((v) => v !== "" && v !== "—");
    return columna.length > 0 && columna.every((v) => NUMERIC_CELL.test(v)) ? "r" : "";
  });
  const thead = `<thead><tr>${header.map((c, i) => cell("th", c, aligns[i] ?? "")).join("")}</tr></thead>`;
  const tbody = body
    .map((row) => {
      const celdas = Array.from({ length: cols }, (_, i) => cell("td", row[i] ?? "", aligns[i] ?? ""));
      return `<tr>${celdas.join("")}</tr>`;
    })
    .join("");
  // El wrapper es NUESTRO, no del modelo: la tabla scrollea sola en pantallas angostas en vez de
  // desbordar la burbuja (el chat móvil vive en ~88% de 390px).
  return `<div class="md-table-wrap"><table class="md-table">${thead}<tbody>${tbody}</tbody></table></div>`;
}

export function renderMarkdown(md: string): string {
  const escaped = escapeHtml(md ?? "");
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = (): void => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
      para = [];
    }
  };
  const flushList = (): void => {
    if (list.length) {
      out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
      list = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // TABLA: encabezado con pipes + fila de guiones justo debajo. Sin la fila de guiones NO es
    // una tabla (una frase con un "|" suelto sigue siendo un párrafo).
    const siguiente = lines[i + 1];
    if (line.includes("|") && siguiente !== undefined && isSeparatorRow(siguiente)) {
      const header = splitRow(line);
      const seps = splitRow(siguiente);
      const body: string[][] = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        const fila = lines[j] ?? "";
        if (!fila.includes("|") || fila.trim() === "") break;
        body.push(splitRow(fila));
      }
      flushPara();
      flushList();
      out.push(buildTable(header, seps, body));
      i = j - 1; // el for avanza uno más
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/); // "- x" o "* x" (espacio obligatorio)
    if (bullet) {
      flushPara();
      list.push(bullet[1] ?? "");
      continue;
    }
    flushList();
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/); // "### Título" → h3 (nivel único)
    if (heading) {
      flushPara();
      out.push(`<h3>${inline(heading[1] ?? "")}</h3>`);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return out.join("");
}
