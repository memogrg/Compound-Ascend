import "server-only";

/**
 * Registro de borrados del hogar (E3). created_by/last_edited_by cubren crear y
 * editar; el borrado hace desaparecer la fila, así que el rastro de "quién borró
 * qué" se guarda acá — solo la referencia (tabla + id + quién + cuándo), sin
 * copia del contenido.
 *
 * Se llama desde la capa de app, DESPUÉS de un borrado exitoso de usuario. Los
 * borrados internos/automáticos (Grupo B: sweeps, resync de derivadas) NO se
 * registran: son ruido, no acciones de una persona.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getActiveHouseholdId } from "@/lib/household/active";

type ServerClient = SupabaseClient<Database>;

/**
 * Registra un borrado en household_activity_log. BEST-EFFORT: si el insert del
 * log falla, NO debe tumbar el borrado original — la fila ya se borró y un log a
 * medias es preferible a un borrado que falla por el log. Se traga el error con
 * un warning.
 *
 * En modo solo (sin hogar activo) no registra nada: no hay con quién compartir
 * el rastro. row_id debe ser un uuid (la PK de la fila borrada).
 */
export async function logHouseholdDeletion(
  supabase: ServerClient,
  args: { userId: string; table: string; rowId: string; householdId?: string | null },
): Promise<void> {
  try {
    const householdId =
      args.householdId !== undefined
        ? args.householdId
        : await getActiveHouseholdId(supabase, args.userId);
    if (!householdId) return; // modo solo: nada que compartir

    const { error } = await supabase.from("household_activity_log").insert({
      household_id: householdId,
      user_id: args.userId,
      table_name: args.table,
      row_id: args.rowId,
      action: "delete",
    });
    if (error) {
      console.warn(`[activity-log] no se pudo registrar el borrado de ${args.table}: ${error.message}`);
    }
  } catch (err) {
    console.warn(
      `[activity-log] error registrando borrado de ${args.table}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
