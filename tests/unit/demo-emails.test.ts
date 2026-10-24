import { describe, it, expect } from "vitest";
// @ts-expect-error — módulo .mjs sin tipos; es un helper puro del seeder de demo.
import { resolveDemoEmails, DEMO_EMAIL_DEFAULT } from "../../scripts/demo/demo-emails.mjs";

describe("demo · resolveDemoEmails", () => {
  it("sin override usa el buzón de demo por defecto y deriva a Marta por plus-addressing", () => {
    expect(resolveDemoEmails(undefined)).toEqual({
      owner: DEMO_EMAIL_DEFAULT,
      marta: "information.theglowup+marta@gmail.com",
    });
  });

  it("DEMO_EMAIL_OVERRIDE reconfigura a los dos usuarios con un solo valor", () => {
    expect(resolveDemoEmails("demo@ci.local")).toEqual({
      owner: "demo@ci.local",
      marta: "demo+marta@ci.local",
    });
  });

  it("recorta espacios y trata la cadena vacía como ausencia de override", () => {
    expect(resolveDemoEmails("  ")).toEqual(resolveDemoEmails(undefined));
    expect(resolveDemoEmails("  demo@ci.local  ").owner).toBe("demo@ci.local");
  });

  it("rechaza un override que no es un correo", () => {
    expect(() => resolveDemoEmails("no-es-correo")).toThrow(/no es un correo válido/);
    expect(() => resolveDemoEmails("@sinlocal.test")).toThrow(/no es un correo válido/);
    expect(() => resolveDemoEmails("sinarroba@")).toThrow(/no es un correo válido/);
  });
});
