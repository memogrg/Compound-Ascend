import { MobileHeader } from "../../components/mobile-header";
import { MEmptyState } from "../../components/content-kit";
import { CerrarSesionForm } from "../../components/cerrar-sesion-form";
import { getUser } from "@/lib/auth/session";
import { Paywall } from "./paywall";

/**
 * /m/sin-plan — la cuenta existe pero no tiene plan activo.
 *
 * Dice el ESTADO y ofrece las salidas reales: ir a Ajustes (descargar los datos, borrar la
 * cuenta) o cerrar sesión, y dentro de la app nativa además suscribirse.
 *
 * El paywall nativo vive en `paywall.tsx` y solo se renderiza dentro de Capacitor: compra en
 * App Store / Google Play con los precios que da la tienda. En el navegador no pinta nada y la
 * pantalla queda como siempre.
 *
 * Lo que NO hace, y no es un olvido: no menciona Stripe, ni enlaza a /empezar o
 * /suscripcion, ni sugiere «entrá por la web». Dirigir a comprar fuera de la tienda viola
 * Apple 3.1.1 y las Google Payments Policies, y eso incluye el rodeo de mandar al navegador.
 *
 * No hace falta lógica para salir de esta pantalla: cuando el plan vuelva a estar
 * activo, la guarda del layout deja de redirigir y la app se abre sola.
 */
export const dynamic = "force-dynamic"; // depende de la sesión

export default async function MobileSinPlan() {
  const user = await getUser();
  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" title="Tu cuenta" />
        <MEmptyState
          icon="protection"
          title="Tu cuenta no tiene un plan activo"
          description="Podés seguir accediendo a tus datos, descargarlos o borrar tu cuenta desde Ajustes."
          actionLabel="Ir a Ajustes"
          actionHref="/m/perfil"
        />
        {user ? <Paywall userId={user.id} /> : null}
        <CerrarSesionForm style={{ marginTop: 12 }}>
          <button className="m-btn m-btn-block m-btn-secondary" type="submit">
            Cerrar sesión
          </button>
        </CerrarSesionForm>
      </div>
    </div>
  );
}
