/**
 * isCancel: cerrar la hoja de Apple (o el selector de Google) no es un error y no se muestra.
 * iOS a veces entrega solo el mensaje genérico con el código: 1001 es cancelar, 1000 no.
 */
import { describe, it, expect } from "vitest";
import { isCancel } from "@/lib/capacitor/social-login-init";

describe("isCancel", () => {
  it("AuthorizationError 1001 (solo el código) es cancelación", () => {
    expect(
      isCancel(
        new Error(
          "The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)",
        ),
      ),
    ).toBe(true);
  });

  it("AuthorizationError 1000 (unknown) es un error real", () => {
    expect(
      isCancel(
        new Error(
          "The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)",
        ),
      ),
    ).toBe(false);
  });

  it("la descripción localizada de Apple, en inglés y en español", () => {
    expect(isCancel(new Error("The user canceled the request."))).toBe(true);
    expect(isCancel(new Error("El usuario canceló la solicitud."))).toBe(true);
  });

  it("llega como texto suelto, no como Error", () => {
    expect(isCancel("…AuthorizationError error 1001.")).toBe(true);
    expect(isCancel("…AuthorizationError error 1000.")).toBe(false);
  });
});
