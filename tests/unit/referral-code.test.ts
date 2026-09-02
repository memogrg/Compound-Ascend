/**
 * El código de referido: alfabeto, normalización, validación y URL.
 *
 * El alfabeto está definido DOS veces —en la migración (para generarlo) y en
 * TypeScript (para validarlo)— porque el generador vive en Postgres, dentro del
 * trigger de alta. Que se separen es el riesgo real: la base emitiría códigos
 * que la app rechaza como inválidos y ninguna atribución funcionaría. El primer
 * test compara las dos definiciones carácter por carácter.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  REFERRAL_ALPHABET,
  REFERRAL_CODE_LENGTH,
  isValidReferralCode,
  normalizeReferralCode,
  referralUrl,
} from "@/lib/referrals/code";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260826000001_referrals.sql"),
  "utf8",
);

describe("alfabeto sin ambigüedades", () => {
  it("coincide con el de la migración", () => {
    const m = MIGRATION.match(/alphabet constant text := '([^']+)'/);
    expect(m?.[1]).toBe(REFERRAL_ALPHABET);
  });

  it("la longitud coincide con la de la migración", () => {
    const m = MIGRATION.match(/len\s+constant int\s+:= (\d+)/);
    expect(Number(m?.[1])).toBe(REFERRAL_CODE_LENGTH);
  });

  it("no contiene ningún carácter ambiguo (O/0/I/1/L)", () => {
    for (const c of ["O", "0", "I", "1", "L"]) {
      expect(REFERRAL_ALPHABET.includes(c), `contiene ${c}`).toBe(false);
    }
  });

  it("no repite símbolos", () => {
    expect(new Set(REFERRAL_ALPHABET).size).toBe(REFERRAL_ALPHABET.length);
  });

  it("el espacio de códigos es lo bastante grande para no ser enumerable", () => {
    // 31^8 ≈ 8,5·10^11: probar códigos al azar no sirve para descubrir usuarios.
    expect(REFERRAL_ALPHABET.length ** REFERRAL_CODE_LENGTH).toBeGreaterThan(1e11);
  });
});

describe("normalización", () => {
  it("acepta minúsculas: quien teclea su código a mano no debería fallar", () => {
    expect(normalizeReferralCode("abcd2345")).toBe("ABCD2345");
    expect(isValidReferralCode("abcd2345")).toBe(true);
  });

  it("acepta espacios alrededor (pegado desde otra app)", () => {
    expect(isValidReferralCode("  ABCD2345 ")).toBe(true);
  });

  it("null/undefined/vacío no son códigos", () => {
    expect(isValidReferralCode(null)).toBe(false);
    expect(isValidReferralCode(undefined)).toBe(false);
    expect(isValidReferralCode("")).toBe(false);
    expect(normalizeReferralCode(null)).toBe("");
  });
});

describe("validación de forma", () => {
  it("rechaza longitudes distintas de 8", () => {
    expect(isValidReferralCode("ABCD234")).toBe(false);
    expect(isValidReferralCode("ABCD23456")).toBe(false);
  });

  it("rechaza caracteres ambiguos aunque tenga el largo correcto", () => {
    // Justamente los que el alfabeto excluye: si alguien transcribe mal un QR,
    // el código no debe pasar la validación de forma.
    expect(isValidReferralCode("ABCD2340")).toBe(false); // 0
    expect(isValidReferralCode("ABCD234O")).toBe(false); // O
    expect(isValidReferralCode("ABCD234I")).toBe(false); // I
    expect(isValidReferralCode("ABCD234L")).toBe(false); // L
    expect(isValidReferralCode("ABCD2341")).toBe(false); // 1
  });

  it("rechaza intentos de inyección y basura", () => {
    expect(isValidReferralCode("' OR 1=1")).toBe(false);
    expect(isValidReferralCode("<script>")).toBe(false);
    expect(isValidReferralCode("../../etc")).toBe(false);
  });
});

describe("URL de invitación", () => {
  it("apunta a /signup con el código", () => {
    expect(referralUrl("https://app.example.com", "ABCD2345")).toBe(
      "https://app.example.com/signup?ref=ABCD2345",
    );
  });

  it("tolera la barra final del origen", () => {
    expect(referralUrl("https://app.example.com/", "ABCD2345")).toBe(
      "https://app.example.com/signup?ref=ABCD2345",
    );
  });

  it("normaliza el código dentro de la URL", () => {
    expect(referralUrl("https://x.io", "abcd2345")).toContain("ref=ABCD2345");
  });

  it("NO lleva PII: solo el código viaja en el link (y por tanto en el QR)", () => {
    const url = referralUrl("https://x.io", "ABCD2345");
    expect(new URL(url).searchParams.size).toBe(1);
    expect(new URL(url).searchParams.get("ref")).toBe("ABCD2345");
  });
});
