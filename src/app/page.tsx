import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { Landing } from "@/components/marketing/landing";

/**
 * Raíz pública: los visitantes ven la landing CARTERA+;
 * con sesión activa se redirige al panel.
 */
export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");
  return <Landing />;
}
