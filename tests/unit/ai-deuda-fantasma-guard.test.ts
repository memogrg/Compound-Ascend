import { describe, it, expect } from "vitest";
import { guardDeudaFantasma, MENSAJE_SIN_DEUDA } from "@/lib/ai/deuda-fantasma-guard";

const SIN_DEUDA: { balance: number }[] = [];
const CON_DEUDA = [{ balance: 700_000 }];
const SALDADA = [{ balance: 0 }, { balance: 0.3 }]; // todas ≤0.5

describe("deuda-fantasma-guard", () => {
  it("BLOQUEA un directivo de abono cuando NO hay deuda viva (la fantasma de consistencia)", () => {
    const r = guardDeudaFantasma("El resto destinalo a abonar a tu deuda este mes.", SIN_DEUDA);
    expect(r.bloqueado).toBe(true);
    expect(r.reply).toBe(MENSAJE_SIN_DEUDA);
  });
  it("BLOQUEA aunque las deudas existan pero estén todas saldadas (≤0.5)", () => {
    const r = guardDeudaFantasma("Te conviene abonar a la tarjeta cuanto antes.", SALDADA);
    expect(r.bloqueado).toBe(true);
  });
  it("NO bloquea si hay una deuda VIVA (el 'abonar a tu deuda' apunta a la real)", () => {
    const r = guardDeudaFantasma("Lo mejor es abonar ₡100.000 a tu tarjeta este mes.", CON_DEUDA);
    expect(r.bloqueado).toBe(false);
    expect(r.reply).toContain("abonar ₡100.000");
  });
  it("NO bloquea una mención en marco COMPARATIVO/condicional (hedge, no directivo)", () => {
    const r = guardDeudaFantasma(
      "Una vez que cubras tu fondo, comparamos si conviene abonar a la deuda o invertir.",
      SIN_DEUDA,
    );
    expect(r.bloqueado).toBe(false);
  });
  it("NO bloquea si no hay ningún directivo de pago-de-deuda", () => {
    const r = guardDeudaFantasma(
      "Lo más importante es automatizar un aporte a tu fondo de emergencia.",
      SIN_DEUDA,
    );
    expect(r.bloqueado).toBe(false);
  });
  it("el mensaje de reemplazo no inventa cifras ni deudas", () => {
    expect(MENSAJE_SIN_DEUDA).not.toMatch(/[₡$]\s?\d/);
    expect(MENSAJE_SIN_DEUDA).toContain("No tenés ninguna deuda con saldo pendiente");
  });
});
