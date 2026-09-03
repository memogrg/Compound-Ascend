import { getUser } from "@/lib/auth/session";
import { Landing } from "@/components/marketing/v3/landing";

/**
 * Raíz pública: la landing, SIEMPRE.
 *
 * Antes, con sesión activa, esta página redirigía a /dashboard. Eso convertía la
 * landing en inalcanzable para cualquier usuario logueado —ni escribiendo la URL—
 * y, combinado con un logout que caía en /login sin ningún enlace de vuelta, dejaba
 * a la gente encerrada: para ver la página principal había que borrar cookies.
 *
 * Ahora la landing se muestra siempre y, si hay sesión, el header ofrece «Ir a mi
 * panel» en lugar de «Iniciar sesión». Es lo que hacen Linear y Notion: la web sigue
 * siendo la puerta, y estar logueado solo cambia qué dice el botón.
 */
export default async function Home() {
  const user = await getUser();
  return <Landing conSesion={Boolean(user)} />;
}
