import "server-only";

/**
 * «Buscar avisos ahora»: el usuario acaba de reenviar un correo (o de agregar la
 * dirección en Gmail) y no quiere esperar al cron. Corre el mismo poller que el
 * cron, una vez, y devuelve un mensaje humano. Requiere sesión; el poller en sí
 * procesa el buzón entero (sirve a todas las cuentas a la vez), así que hay tope
 * por usuario y tope global para no abrir IMAP en ráfaga.
 */
import { requireUser } from "@/lib/auth/session";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { runEmailIngestPoll } from "@/lib/ingestion/email/run-poll";

export type PollNowResult = { ok: boolean; message: string; encontrado: boolean };

export async function pollIngestNow(): Promise<PollNowResult> {
  const user = await requireUser();

  const porUsuario = await rateLimit(`ingest-poll:user:${user.id}`, RATE_LIMITS.ingestPollUser);
  if (!porUsuario.ok) {
    return {
      ok: false,
      encontrado: false,
      message: "Ya revisamos varias veces en estos minutos. Esperá un rato o dejá que corra solo.",
    };
  }
  const global = await rateLimit("ingest-poll:global", RATE_LIMITS.ingestPollGlobal);
  if (!global.ok) {
    // Alguien más acaba de disparar la revisión: el buzón ya se está leyendo.
    return {
      ok: true,
      encontrado: false,
      message: "Ya estamos revisando el buzón. Recargá en unos segundos.",
    };
  }

  const out = await runEmailIngestPoll();
  if (out.skipped) {
    return {
      ok: false,
      encontrado: false,
      message: "La lectura de correo no está encendida todavía.",
    };
  }
  const encontrado = out.propuestos > 0 || out.confirmacionesGmail > 0 || out.sinParsear > 0;
  return {
    ok: true,
    encontrado,
    message: encontrado
      ? "Listo: revisá arriba y en Por revisar."
      : "Buzón revisado: todavía no ha llegado nada nuevo para tu cuenta.",
  };
}
