/**
 * Código de referido: alfabeto, normalización y validación. Puro, sin IO.
 *
 * El código se GENERA en la base (`gen_referral_code`, migración
 * 20260826000001) porque nace junto al perfil, dentro del trigger de alta. Este
 * archivo es el lado del cliente/servidor Node: valida y normaliza lo que llega
 * por la URL antes de tocar la base. Las dos definiciones del alfabeto tienen
 * que coincidir — hay un test que compara esta constante con la de la migración.
 */

/**
 * 31 símbolos SIN AMBIGÜEDADES: sin O/0, sin I/1/L. El código se dicta por
 * teléfono y se transcribe desde un QR impreso; confundir O con 0 manda al
 * usuario a un código inexistente.
 */
export const REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const REFERRAL_CODE_LENGTH = 8;

const RE = new RegExp(`^[${REFERRAL_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);

/**
 * Normaliza lo que venga de la URL: mayúsculas y sin espacios. Alguien que
 * teclea su código a mano lo escribe en minúsculas o lo pega con un espacio, y
 * eso no debería fallar.
 */
export function normalizeReferralCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/**
 * ¿Tiene forma de código? Solo comprueba la FORMA — que exista es cosa de la
 * base. Sirve para descartar basura (o un intento de inyección) antes de
 * consultar, sin gastar una query por cada `?ref=` inventado.
 */
export function isValidReferralCode(raw: string | null | undefined): boolean {
  return RE.test(normalizeReferralCode(raw));
}

/** URL de invitación. Solo lleva el código: es público por diseño, y nada más. */
export function referralUrl(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, "")}/signup?ref=${encodeURIComponent(normalizeReferralCode(code))}`;
}
