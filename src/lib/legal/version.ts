/**
 * Versión vigente de los documentos legales (privacidad, términos).
 *
 * UNA sola constante para las tres páginas: si cada una trajera su propia fecha,
 * tarde o temprano dirían cosas distintas y no habría forma de saber cuál rige.
 * El delta de aceptación la va a usar para registrar QUÉ versión aceptó cada
 * persona, así que cambiarla es un hecho con consecuencias: subila solo cuando
 * el texto cambie de verdad.
 */
export const LEGAL_VERSION = "2026-09-12";

/** La misma fecha, escrita para leer. */
export const LEGAL_ACTUALIZADO = "12 de setiembre de 2026";

/** Correo de privacidad. */
// TODO(alias): privacidad@aitechumbrella.com todavía no existe en Workspace — hay que
// crearlo antes de enviar a las tiendas. NO usar communications@: ése es el buzón de
// ingesta que lee el poller IMAP, y los mensajes de gente quedarían mezclados con los
// avisos bancarios reenviados.
export const CORREO_PRIVACIDAD = "privacidad@aitechumbrella.com";
