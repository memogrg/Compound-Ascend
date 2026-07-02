/**
 * Paso de nombre del invitado tras aceptar la invitación: /invitacion/nombre
 * Único paso del onboarding del invitado (el resto del perfil lo hereda del hogar).
 */
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NameStep } from "@/modules/personal-profile/components/name-step";

export const metadata = { title: "Tu nombre — CARTERA+" };

const TITLE_HTML = 'Te damos la <span class="it">bienvenida</span>';

export default async function NameStepPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/invitacion/nombre");

  let current = (user.user_metadata?.display_name as string | undefined) ?? "";
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    current = data?.display_name ?? current;
  }

  return (
    <AuthShell
      titleHTML={TITLE_HTML}
      subtitle="Ya formas parte del hogar. Solo falta un detalle: dinos cómo quieres que te llamemos."
    >
      <NameStep defaultName={current} />
    </AuthShell>
  );
}
