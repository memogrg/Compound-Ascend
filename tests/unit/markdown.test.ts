import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

/**
 * La propiedad de seguridad REAL del renderer: toda etiqueta de la salida la generó este módulo.
 * Es más fuerte que buscar substrings hostiles — un `onclick=` dentro de `&lt;…&gt;` es texto
 * inerte, y lo que importa es que no exista NINGUNA etiqueta que no esté en el allowlist.
 */
const ALLOWLIST = new Set([
  "p", "br", "strong", "em", "ul", "li", "h3", "a",
  "div", "table", "thead", "tbody", "tr", "th", "td",
]);

function soloEtiquetasPermitidas(html: string): boolean {
  return [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].every((m) =>
    ALLOWLIST.has((m[1] ?? "").toLowerCase()),
  );
}

describe("renderMarkdown · formato del asesor", () => {
  it("negrita + viñeta (caso del bug)", () => {
    const html = renderMarkdown("**hola** y una lista\n* x\n* y");
    expect(html).toContain("<strong>hola</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>x</li>");
    expect(html).toContain("<li>y</li>");
  });

  it("cursiva, subtítulo y guiones como viñetas", () => {
    expect(renderMarkdown("*ojo*")).toContain("<em>ojo</em>");
    expect(renderMarkdown("### Resumen")).toContain("<h3>Resumen</h3>");
    expect(renderMarkdown("- uno\n- dos")).toContain("<li>uno</li>");
  });

  it("enlaces http(s) → <a> seguro; otros esquemas quedan literales", () => {
    const ok = renderMarkdown("[Google](https://google.com)");
    expect(ok).toContain('<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>');
    const bad = renderMarkdown("[x](javascript:alert(1))");
    expect(bad).not.toContain("<a "); // no se produce anchor navegable; el resto queda como texto
  });
});

describe("renderMarkdown · tablas de datos numéricos", () => {
  const tabla = [
    "| Tasa | Capital | Años |",
    "| --- | --- | --- |",
    "| 6% | ₡12.500.000 | 18 |",
    "| 8% | ₡9.800.000 | 14,5 |",
  ].join("\n");

  it("encabezado en thead y filas en tbody", () => {
    const html = renderMarkdown(tabla);
    expect(html).toContain("<table");
    expect(html).toContain("<thead><tr>");
    expect(html).toContain("<th");
    expect(html).toContain("Tasa");
    expect(html).toContain("<tbody>");
    expect(html).toContain("₡12.500.000");
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // 1 de encabezado + 2 de cuerpo
  });

  it("las columnas numéricas se alinean a la derecha solas (el modelo no marca alineación)", () => {
    const html = renderMarkdown(tabla);
    // Las tres columnas son numéricas (6%, ₡12.500.000, 18) → todas a la derecha.
    expect(html).toContain('<td class="md-r">6%</td>');
    expect(html).toContain('<td class="md-r">₡12.500.000</td>');
    expect(html).toContain('<td class="md-r">14,5</td>');
  });

  it("una columna de texto NO se alinea a la derecha", () => {
    const html = renderMarkdown("| Sobre | Gastado |\n| --- | --- |\n| Comida | ₡320.000 |");
    expect(html).toContain("<td>Comida</td>");
    expect(html).toContain('<td class="md-r">₡320.000</td>');
  });

  it("respeta la alineación explícita de la fila de guiones", () => {
    const html = renderMarkdown("| a | b |\n| ---: | :---: |\n| x | y |");
    expect(html).toContain('<td class="md-r">x</td>');
    expect(html).toContain('<td class="md-c">y</td>');
  });

  it("el formato inline sigue funcionando dentro de las celdas", () => {
    const html = renderMarkdown("| Dato |\n| --- |\n| **importante** |");
    expect(html).toContain("<strong>importante</strong>");
  });

  it("sin fila de guiones NO es una tabla (una frase con un pipe sigue siendo párrafo)", () => {
    const html = renderMarkdown("esto | aquello");
    expect(html).not.toContain("<table");
    expect(html).toContain("<p>esto | aquello</p>");
  });

  it("filas torcidas (más o menos celdas que el encabezado) no rompen el render", () => {
    const html = renderMarkdown("| a | b |\n| --- | --- |\n| solo-una |\n| 1 | 2 | 3 |");
    expect(html).toContain("<table");
    // Cada fila del cuerpo queda con exactamente 2 celdas, como el encabezado.
    const filas = html.split("<tr>").slice(2);
    for (const f of filas) expect((f.match(/<td/g) ?? []).length).toBe(2);
  });

  it("la tabla corta el párrafo y la lista que venían antes", () => {
    const html = renderMarkdown("texto\n\n- uno\n\n| a |\n| --- |\n| 1 |");
    expect(html.indexOf("<p>texto</p>")).toBeLessThan(html.indexOf("<table"));
    expect(html.indexOf("<ul>")).toBeLessThan(html.indexOf("<table"));
    expect(html).toContain("<li>uno</li>");
  });

  it("el texto después de la tabla vuelve a ser párrafo", () => {
    const html = renderMarkdown("| a |\n| --- |\n| 1 |\n\nCon 8% llegás antes.");
    expect(html).toContain("<p>Con 8% llegás antes.</p>");
  });

  it("va envuelta para poder scrollear en pantallas angostas", () => {
    expect(renderMarkdown(tabla)).toContain('<div class="md-table-wrap">');
  });
});

describe("renderMarkdown · seguridad (XSS)", () => {
  it("un <script> del modelo se escapa y NUNCA se ejecuta", () => {
    const html = renderMarkdown("mira **esto** <script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>esto</strong>"); // el markdown legítimo sí se aplica
  });

  it("atributos de evento e img onerror quedan como texto escapado", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=\"alert");
    expect(html).toContain("&lt;img");
  });

  it("un href no-http dentro de un enlace no produce anchor navegable", () => {
    const html = renderMarkdown("[click](vbscript:msgbox)");
    expect(html).not.toContain("<a ");
  });

  it("un <script> DENTRO de una celda se escapa igual que en el resto", () => {
    const html = renderMarkdown("| a |\n| --- |\n| <script>alert(1)</script> |");
    expect(html).toContain("<table");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("una celda no puede cerrar la tabla ni inyectar markup propio", () => {
    const html = renderMarkdown('| a |\n| --- |\n| </td></tr><td onclick="x">hola |');
    // El markup del modelo queda como TEXTO escapado, no como etiqueta: sigue habiendo una sola
    // celda de cuerpo. (El literal "onclick=" aparece, pero dentro de &lt;…&gt; — es inerte.)
    expect(html).toContain("&lt;/td&gt;");
    expect(html).toContain("&quot;x&quot;");
    expect((html.match(/<td/g) ?? []).length).toBe(1);
    expect(soloEtiquetasPermitidas(html)).toBe(true);
  });

  it("un encabezado de tabla con HTML tampoco escapa del <th>", () => {
    const html = renderMarkdown("| <img src=x onerror=alert(1)> |\n| --- |\n| 1 |");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(soloEtiquetasPermitidas(html)).toBe(true);
  });

  it("ninguna entrada hostil produce una etiqueta fuera del allowlist", () => {
    const hostiles = [
      "| <svg/onload=alert(1)> |\n| --- |\n| <iframe src=//evil> |",
      "**x** <style>body{}</style>\n\n| a | b |\n| --- | --- |\n| <object> | <base href=//evil> |",
      "| a |\n| --- |\n| [x](javascript:alert(1)) |",
    ];
    for (const md of hostiles) expect(soloEtiquetasPermitidas(renderMarkdown(md))).toBe(true);
  });
});
