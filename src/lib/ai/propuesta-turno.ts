/**
 * ¿La propuesta de acción PERTENECE al turno que la generó?
 *
 * EL BUG. Una tarjeta de acción propuesta en un turno reaparecía pegada a una respuesta POSTERIOR
 * y no relacionada: se preguntaba por supermercados y salía la tarjeta del gasto de transporte de
 * dos turnos antes. La tarjeta vive colgada de SU mensaje en el cliente, así que no se "movía":
 * lo que pasaba es que el modelo la volvía a EMITIR. El turno anterior sigue en la ventana de
 * historial que se le manda, y con el "te propongo registrar…" a la vista el modelo re-emite el
 * bloque ```action``` como si el pedido siguiera abierto. Para el usuario es indistinguible de una
 * tarjeta que se quedó pegada — y es peor, porque un tap ahí registra el gasto DOS VECES.
 *
 * LA REGLA. Un alta de movimiento solo puede nacer de un mensaje que PIDA un alta. Es la misma
 * regla que ya aplica el carril determinista (`detectCreateAction` no registra desde una
 * pregunta); acá se extiende a lo que propone el LLM, que es quien no la tenía.
 *
 * Alcance deliberadamente acotado a `create_transaction` / `create_transactions_batch`: son las
 * acciones que ESCRIBEN plata en el libro diario y las únicas que se vieron reaparecer. Las que
 * nacen de un consejo (subir un sobre, fijar un DCA, abonar a una deuda) responden a la pregunta
 * del turno por definición, y filtrarlas rompería su caso de uso.
 */
import { isQuestion, pideAltaDeMovimiento } from "@/lib/ai/action-lane";
import { pareceBloqueDeEstado, pareceConfirmacionDeAlta } from "@/lib/ai/statement-parse";
import type { AIActionType } from "@/lib/ai/types";

/** "sí", "dale", "ok", "confirmá", "registralo" — la respuesta a una repregunta del asesor. */
const AFIRMACION_RE =
  /^\s*(?:s[ií]|sip|dale|ok(?:ey)?|listo|correcto|exacto|as[ií] es|de una|por favor|confirm\w*|registr\w*|anot\w*|agreg\w*|guard\w*)\b/i;

/**
 * `true` si la acción puede acompañar a este mensaje. `false` = la propuesta es de otro turno y
 * hay que descartarla (el texto de la respuesta se conserva; lo que se cae es la tarjeta).
 */
export function propuestaPerteneceAlTurno(mensaje: string, tipo: AIActionType): boolean {
  if (tipo !== "create_transaction" && tipo !== "create_transactions_batch") return true;
  const t = mensaje.trim();
  // El pedido de alta gana aunque venga con signos de pregunta ("¿me registrás un gasto de…?").
  if (pideAltaDeMovimiento(t)) return true;
  // Un bloque de estado pegado, su confirmación ("dale, registralas") y el "sí" a una repregunta
  // son pedidos de alta aunque no traigan verbo ni monto.
  if (pareceBloqueDeEstado(t) || pareceConfirmacionDeAlta(t) || AFIRMACION_RE.test(t)) return true;
  // Una PREGUNTA no ordena un alta. Es el corte que cierra el bug: "¿qué gastos hay en
  // supermercados?" no puede traer colgada la tarjeta del gasto de transporte de antes.
  return !isQuestion(t);
}
