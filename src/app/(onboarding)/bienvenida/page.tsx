import { redirect } from "next/navigation";
import { Wizard } from "@/modules/personal-profile";
import { getDraft } from "@/modules/personal-profile/services/profile-service";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { attributeReferralFromCookie } from "@/lib/referrals/service";
import { logger } from "@/lib/logger";
import { cumplirCheckout } from "@/modules/account/services/stripe-fulfillment";
import { getEstadoSuscripcion } from "@/modules/account/services/subscription-service";
import type { ProfileDraft } from "@/modules/personal-profile/types";

export const metadata = { title: "Tu perfil financiero — CARTERA+" };

/**
 * Setup Wizard del Módulo 1. Carga el borrador guardado (si Supabase está
 * configurado) para retomar donde se quedó.
 *
 * Es también el `success_url` del checkout de /empezar: Stripe vuelve acá con
 * `?session_id=`. Antes de mostrar nada se cumple el checkout —se verifica con
 * Stripe que la sesión es de este usuario y está pagada, y se aplica el plan—
 * en vez de esperar al webhook, que puede llegar segundos después y dejaría a
 * la persona mirando un muro justo después de pagar. Es idempotente con el
 * webhook: los dos llaman a la misma función y el segundo no cambia nada.
 */
export default async function BienvenidaPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  let initialDraft: ProfileDraft = {};
  if (isSupabaseConfigured()) {
    const { session_id: sessionId } = await searchParams;
    const user = await getUser();

    if (user && sessionId) {
      const r = await cumplirCheckout(sessionId, user.id);
      if (!r.ok) logger.warn("bienvenida: checkout no cumplido", { motivo: r.motivo });
    }

    // Sin plan no hay onboarding que hacer: la cuenta existe pero falta pagar.
    // Es el caso de quien llegó acá sin pasar por Stripe (el alta vieja por
    // /signup) o cuyo checkout no se pudo confirmar.
    if (user) {
      const estado = await getEstadoSuscripcion(user.id);
      if (estado.plan === "ninguno") redirect("/empezar?reanudar=1");
    }

    // Red de seguridad de la atribución: el camino normal es /auth/callback,
    // pero un alta que establezca sesión sin pasar por ahí (confirmación de
    // correo desactivada, sesión ya viva al abrir el link) llegaría igual a esta
    // pantalla. Es idempotente por el UNIQUE de referred_user_id, así que
    // llamarla dos veces no duplica nada.
    await attributeReferralFromCookie();
    initialDraft = await getDraft();
  }
  return <Wizard initialDraft={initialDraft} />;
}
