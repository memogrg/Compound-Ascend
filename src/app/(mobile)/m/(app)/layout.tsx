import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { MobileTabBar } from "../components/mobile-tab-bar";

/**
 * Layout de las pantallas AUTENTICADAS del móvil. Usa la sesión existente
 * (getUser() de @/lib/auth/session, misma cookie que la web) y, si no hay
 * sesión, redirige a /m/login. /m/login queda fuera de este grupo (app), así
 * que no dispara la guarda (evita el bucle de redirección).
 *
 * Añade la tab bar inferior fija; el contenido deja aire para ella con `.m-scroll`.
 */
export default async function MobileAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  // En PRODUCCIÓN, sin sesión → a /m/login. En DESARROLLO se permite una vista
  // DEMO sin sesión (para poder previsualizar /m sin depender del login local);
  // la propia pantalla marca que es demo. Nunca aplica en producción.
  const allowDevPreview = !user && process.env.NODE_ENV !== "production";
  if (!user && !allowDevPreview) redirect("/m/login");

  return (
    <>
      {children}
      <MobileTabBar />
    </>
  );
}
