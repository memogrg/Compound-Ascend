import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { VsMes } from "@/modules/dashboard";
import { MVsMes } from "@/app/(mobile)/m/components/content-kit/vs-mes";

/** Render del chip por tono: flecha + clase de color + valor + verbo; y degradación a nada. */
const html = (vs: VsMes) => renderToStaticMarkup(createElement(MVsMes, { vs, currency: "CRC" }));

describe("MVsMes · render por tono", () => {
  it("null → no pinta nada (la ficha degrada sin chip)", () => {
    expect(html(null)).toBe("");
  });
  it("pos → clase 'pos', flecha ↑, % y etiqueta", () => {
    const out = html({ format: "percent", value: 0.1, dir: "up", tone: "pos", label: "vs mes ant." });
    expect(out).toContain("m-vsmes pos");
    expect(out).toContain("↑");
    expect(out).toContain("10%");
    expect(out).toContain("vs mes ant.");
  });
  it("neg → clase 'neg', flecha ↓, verbo", () => {
    const out = html({ format: "amount", value: 200, dir: "down", tone: "neg", label: "pagaste" });
    expect(out).toContain("m-vsmes neg");
    expect(out).toContain("↓");
    expect(out).toContain("pagaste");
  });
  it("neutral (flat) → sin clase de color, flecha →", () => {
    const out = html({ format: "amount", value: 0, dir: "flat", tone: "neutral", label: "sin cambios" });
    expect(out).toContain('class="m-vsmes"');
    expect(out).toContain("→");
  });
});
