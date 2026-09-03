/**
 * Generación y reconocimiento de la dirección de ingesta ÚNICA por cuenta.
 *
 * La dirección ES la identidad del correo entrante, así que su local-part es un
 * secreto: 50 bits de aleatoriedad criptográfica en base32 sin vocales — no se
 * adivina, no se confunde al dictarla (sin 0/O ni 1/l/I) y no forma palabras.
 *
 * Puro y sin dependencias de servidor: se prueba sin red ni BD.
 */
import { randomBytes } from "node:crypto";

/** Alfabeto sin vocales ni caracteres que se confunden al leer o dictar. */
const ALPHABET = "23456789bcdfghjkmnpqrstvwxz";
const TOKEN_LEN = 10; // 27^10 ≈ 2^47,6 combinaciones

/** Token aleatorio del local-part. Rechaza el módulo sesgado descartando bytes. */
export function generateIngestToken(): string {
  let out = "";
  while (out.length < TOKEN_LEN) {
    for (const byte of randomBytes(TOKEN_LEN)) {
      // 256 no es múltiplo de 27: descartar la cola evita sesgo hacia las
      // primeras letras del alfabeto.
      const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
      if (byte >= max) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === TOKEN_LEN) break;
    }
  }
  return out;
}

/** Dirección completa a partir del token y el dominio de ingesta. */
export function buildIngestAddress(token: string, domain: string): string {
  return `u${token}@${domain}`.toLowerCase();
}

/**
 * Filtra, de todas las direcciones vistas en un correo, las que pertenecen al
 * dominio de ingesta. Solo estas pueden identificar a una cuenta por dirección;
 * el resto son destinatarios ajenos que no nos dicen nada.
 */
export function ingestAddressesIn(candidates: string[], domain: string | null): string[] {
  if (!domain) return [];
  const suffix = `@${domain.toLowerCase()}`;
  return [...new Set(candidates.map((c) => c.toLowerCase()).filter((c) => c.endsWith(suffix)))];
}
