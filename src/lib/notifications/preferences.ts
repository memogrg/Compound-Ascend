import "server-only";

/**
 * Preferencias de notificación por canal (user_settings.notifications jsonb).
 * Default ON: una clave ausente significa "encendido"; solo apagar es explícito.
 * Lectura/escritura con inyección de contexto (resolveAuth), para que crons sin
 * sesión las reusen filtrando por userId explícito.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";

export const NOTIFICATION_CHANNELS = ["email", "whatsapp", "push", "inApp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationPrefs = Record<NotificationChannel, boolean>;

/** Todos los canales encendidos por defecto. */
const DEFAULTS: NotificationPrefs = { email: true, whatsapp: true, push: true, inApp: true };

function isChannel(k: string): k is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(k);
}

/**
 * Puro: mezcla lo guardado sobre los defaults. Clave ausente → ON; clave booleana
 * presente → se respeta; cualquier valor no-booleano se ignora (cae al default).
 */
export function mergeNotificationPrefs(
  stored: Record<string, unknown> | null | undefined,
): NotificationPrefs {
  const out: NotificationPrefs = { ...DEFAULTS };
  if (stored) {
    for (const [k, v] of Object.entries(stored)) {
      if (isChannel(k) && typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

/** Preferencias de un usuario (defaults ON para lo ausente). */
export async function getNotificationPrefs(
  userId: string,
  ctx?: AuthContext,
): Promise<NotificationPrefs> {
  const { db } = await resolveAuth(ctx);
  const { data } = await db
    .from("user_settings")
    .select("notifications")
    .eq("user_id", userId)
    .maybeSingle();
  return mergeNotificationPrefs((data?.notifications ?? null) as Record<string, unknown> | null);
}

/** Enciende/apaga UN canal para un usuario (read-modify-write del jsonb). */
export async function setNotificationChannel(
  userId: string,
  channel: NotificationChannel,
  enabled: boolean,
  ctx?: AuthContext,
): Promise<void> {
  const { db } = await resolveAuth(ctx);
  const current = await getNotificationPrefs(userId, ctx);
  const next: NotificationPrefs = { ...current, [channel]: enabled };
  await db
    .from("user_settings")
    .upsert({ user_id: userId, notifications: next }, { onConflict: "user_id" });
}
