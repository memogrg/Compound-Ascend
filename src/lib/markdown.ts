import { escapeHtml } from "@/lib/security/escape-html";

/**
 * Convierte el subconjunto de Markdown que produce el asesor (negritas, cursivas, viñetas,
 * subtítulos, enlaces) a HTML SEGURO para inyectar con dangerouslySetInnerHTML.
 *
 * SEGURIDAD — por qué no hace falta un sanitizador externo:
 *  - Se ESCAPA todo el input con escapeHtml() ANTES de transformar. El modelo NO puede inyectar
 *    HTML: un "<script>" del modelo entra como "&lt;script&gt;" y jamás se ejecuta; un
 *    'onclick="…"' queda como texto escapado.
 *  - El output solo contiene las etiquetas que ESTE módulo genera (allowlist cerrado:
 *    p, br, strong, em, ul, li, h3, a). No reintroducimos HTML del input en ningún punto.
 *  - Los enlaces se restringen a http(s); cualquier otro esquema (javascript:, data:) se deja
 *    como texto literal. El href ya viene escapado, así que no puede romper el atributo.
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

  for (const line of lines) {
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
