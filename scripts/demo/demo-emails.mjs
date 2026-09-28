// Correos de la cuenta demo "Familia Ramírez Solano".
//
// Por defecto se siembra contra el buzón real de demo (existe TAMBIÉN en producción). Con
// DEMO_EMAIL_OVERRIDE se puede sembrar contra una cuenta sintética — p. ej. demo@ci.local en
// CI — sin tocar el resto del seeder. Marta comparte el buzón del titular por plus-addressing,
// así un solo override reconfigura a los dos usuarios de la demo.
//
// Este valor por defecto es un correo de dominio real a propósito (la cuenta demo de producción).
// El guardacorreos (tests/unit/higiene-repo-publico.test.ts) lo tiene en su allowlist; cuando la CI pase
// a demo@ci.local, ese default debería moverse a un dominio sintético y salir de la allowlist.
export const DEMO_EMAIL_DEFAULT = "information.theglowup@gmail.com";

/**
 * Resuelve los correos de las dos identidades de la demo a partir del override (o el default).
 * @param {string | undefined} override valor de DEMO_EMAIL_OVERRIDE
 * @returns {{ owner: string, marta: string }}
 */
export function resolveDemoEmails(override) {
  const owner = (override ?? "").trim() || DEMO_EMAIL_DEFAULT;
  const at = owner.indexOf("@");
  if (at <= 0 || at === owner.length - 1) {
    throw new Error(`DEMO_EMAIL_OVERRIDE no es un correo válido: "${owner}"`);
  }
  const marta = `${owner.slice(0, at)}+marta${owner.slice(at)}`;
  return { owner, marta };
}
