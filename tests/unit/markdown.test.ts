import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

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
});
