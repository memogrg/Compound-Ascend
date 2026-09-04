import "server-only";

/**
 * Avisos de la ingesta por correo, para la pantalla de Configuración:
 *
 *  · La confirmación de reenvío de Gmail que llegó a la dirección de ingesta del
 *    usuario. Google no deja confirmarla desde el servidor, así que se le muestra
 *    el enlace y él la completa con un clic. Sin esto se quedaba a mitad de
 *    camino sin saber por qué.
 *  · Cuántos avisos de banco recibimos que todavía no sabemos leer, y de qué
 *    remitentes. Es la diferencia entre «no llegó nada» y «llegó, estamos en eso».
 *
 * Lectura con cliente de sesión → RLS. La escritura (dar por atendido) va con
 * service-role tras comprobar que el aviso es del usuario: la tabla no tiene
 * grant de escritura para el cliente, igual que las demás de la ingesta.
 */
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { householdMemberIds } from "@/lib/household/active";

export type GmailForwardingNotice = {
  id: string;
  confirmUrl: string | null;
  confirmCode: string | null;
  createdAt: string;
};

export type IngestNoticesView = {
  gmail: GmailForwardingNotice[];
  unparsedCount: number;
  unparsedSenders: string[]; // dominios de remitente, para decir «de BNCR, de BCR…»
};

export const EMPTY_NOTICES: IngestNoticesView = {
  gmail: [],
  unparsedCount: 0,
  unparsedSenders: [],
};

export async function listMyIngestNotices(): Promise<IngestNoticesView> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data } = await supabase
    .from("ingest_notices")
    .select("id, kind, from_address, confirm_url, confirm_code, created_at")
    .in("user_id", memberIds)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const gmail = rows
    .filter((r) => r.kind === "gmail_forwarding")
    .map((r) => ({
      id: r.id,
      confirmUrl: r.confirm_url,
      confirmCode: r.confirm_code,
      createdAt: r.created_at,
    }));
  const unparsed = rows.filter((r) => r.kind === "unparsed");
  const unparsedSenders = [
    ...new Set(
      unparsed.map((r) => r.from_address?.split("@")[1]?.toLowerCase() ?? "").filter(Boolean),
    ),
  ];
  return { gmail, unparsedCount: unparsed.length, unparsedSenders };
}

/** El usuario dio por atendido un aviso (p. ej. ya confirmó el reenvío en Gmail). */
export async function resolveIngestNotice(id: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // Propiedad vía RLS: si no lo ve, no es suyo (ni de su hogar).
  const { data: row } = await supabase
    .from("ingest_notices")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, message: "No encontramos ese aviso." };
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("ingest_notices")
    .update({ resolved_at: new Date().toISOString(), last_edited_by: user.id })
    .eq("id", id);
  if (error) return { ok: false, message: "No pudimos actualizar el aviso." };
  return { ok: true };
}
