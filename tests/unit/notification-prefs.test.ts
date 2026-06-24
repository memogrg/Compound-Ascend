import { describe, it, expect } from "vitest";
import { mergeNotificationPrefs } from "@/lib/notifications/preferences";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/notifications/unsubscribe-token";

const SECRET = "test-secret-please-rotate";
const UID = "11111111-1111-1111-1111-111111111111";

describe("mergeNotificationPrefs · defaults ON", () => {
  it("null/undefined → todo encendido", () => {
    expect(mergeNotificationPrefs(null)).toEqual({
      email: true,
      whatsapp: true,
      push: true,
      inApp: true,
    });
    expect(mergeNotificationPrefs(undefined)).toEqual({
      email: true,
      whatsapp: true,
      push: true,
      inApp: true,
    });
  });

  it("clave presente se respeta; ausente → ON", () => {
    expect(mergeNotificationPrefs({ email: false })).toEqual({
      email: false,
      whatsapp: true,
      push: true,
      inApp: true,
    });
  });

  it("valores no-booleanos y claves desconocidas se ignoran (caen al default)", () => {
    const out = mergeNotificationPrefs({ email: "no" as unknown as boolean, foo: true, push: false });
    expect(out).toEqual({ email: true, whatsapp: true, push: false, inApp: true });
  });
});

describe("token de baja HMAC", () => {
  it("roundtrip: firma y verifica el mismo {userId, channel}", () => {
    const token = signUnsubscribeToken(UID, "email", SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ userId: UID, channel: "email" });
  });

  it("rechaza si se manipula el payload", () => {
    const token = signUnsubscribeToken(UID, "email", SECRET);
    const [payload, sig] = token.split(".");
    // payload de otro usuario, firma vieja → no coincide.
    const forgedPayload = Buffer.from(JSON.stringify({ uid: "victim", ch: "email" })).toString(
      "base64url",
    );
    expect(verifyUnsubscribeToken(`${forgedPayload}.${sig}`, SECRET)).toBeNull();
    // firma alterada.
    expect(verifyUnsubscribeToken(`${payload}.${sig}x`, SECRET)).toBeNull();
  });

  it("rechaza con secret distinto", () => {
    const token = signUnsubscribeToken(UID, "whatsapp", SECRET);
    expect(verifyUnsubscribeToken(token, "otro-secret")).toBeNull();
  });

  it("rechaza tokens mal formados o vacíos", () => {
    expect(verifyUnsubscribeToken("", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("sinpunto", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c", SECRET)).toBeNull();
  });
});
