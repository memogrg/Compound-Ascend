import { redirect } from "next/navigation";

/**
 * Raíz. En F1, una vez exista Supabase Auth, redirige a /login si no hay sesión
 * o a /dashboard si la hay (o a /bienvenida si el onboarding no está completo).
 * Por ahora va directo al panel.
 */
export default function Home() {
  redirect("/dashboard");
}
