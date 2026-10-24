import "server-only";

/**
 * Registro de la aceptación de Términos y Privacidad.
 *
 * Qué se guarda y por qué: la VERSIÓN (`LEGAL_VERSION`) y el momento. Un booleano
 * «aceptó» no serviría el día que el texto cambie, porque no dice qué fue lo que esa
 * persona leyó — y eso es justo lo que hay que poder demostrar.
 *
 * Hay dos caminos y usan clientes distintos a propósito:
 *
 *  · `registrarAceptacionConServicio` — alta por correo. Todavía NO hay sesión (el
 *    registro web espera la confirmación del correo), así que la RLS no tiene a quién
 *    atribuirle la escritura. Es uno de los casos legítimos del service-role: sin
 *    sesión de usuario, como la ingesta por correo.
 *  · `aceptarTerminosAction` — la persona ya entró y toca «Aceptar». Ahí SÍ hay sesión
 *    y se escribe con ella, contra la política `profiles_update_own`. La regla del
 *    repositorio es no usar service-role para algo que nace de una petición del usuario.
 *
 * El trigger `protect_profile_plan` no estorba: solo bloquea `plan` y las columnas de
 * facturación, no éstas.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { LEGAL_VERSION } from "@/lib/legal/version";

/** Lo que se escribe en las dos rutas. Un solo lugar: si cambia, cambia para todas. */
function marca() {
  return { terms_version: LEGAL_VERSION, terms_accepted_at: new Date().toISOString() };
}

/**
 * Registra la aceptación de un usuario recién creado, SIN sesión.
 *
 * Best-effort deliberado: si falla, no se aborta el alta. Dejar a alguien sin cuenta
 * porque no se pudo escribir una columna sería peor — y el banner de re-aceptación lo
 * recupera en el primer ingreso, que es exactamente el caso para el que existe.
 */
export async function registrarAceptacionConServicio(userId: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from("profiles").update(marca()).eq("id", userId);
    if (error) throw new Error(error.message);
  } catch (e) {
    // Con rastro, no en silencio: mientras la migración no esté aplicada este es el
    // único lugar donde se ve que un alta quedó SIN registro de aceptación.
    logger.warn("no se pudo registrar la aceptación de términos", {
      userId,
      version: LEGAL_VERSION,
      message: e instanceof Error ? e.message : "?",
    });
  }
}

/**
 * ¿Esta persona ya aceptó la versión vigente? Lo usa el banner.
 *
 * Ante un fallo devuelve `false` —no molestar— pero DEJANDO RASTRO. Lo envuelve acá y
 * no en cada layout a propósito: un `.catch(() => false)` en el sitio de llamada se
 * traga el error sin decir nada, y el fallo más probable es justamente el que hay que
 * ver, «la columna no existe» mientras la migración no esté aplicada. Un feature legal
 * que no registra nada y tampoco avisa es peor que uno roto a la vista.
 */
export async function aceptacionPendiente(userId: string): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("terms_version")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Sin fila todavía no se molesta a nadie: el alta la termina su propio flujo.
    if (!data) return false;
    return data.terms_version !== LEGAL_VERSION;
  } catch (e) {
    logger.warn("no se pudo leer la aceptación de términos; no se muestra el aviso", {
      message: e instanceof Error ? e.message : "?",
    });
    return false;
  }
}

/** Registra la aceptación de quien ya tiene sesión (el botón del banner). */
export async function registrarAceptacionDelUsuario(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update(marca()).eq("id", user.id);
  if (error) {
    logger.error("aceptación de términos fallida", { message: error.message });
    return { ok: false };
  }
  return { ok: true };
}
