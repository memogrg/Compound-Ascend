import { MobileHeader } from "../../components/mobile-header";
import { MEmptyState } from "../../components/content-kit";
import { signOutAction } from "@/lib/auth/actions";

/**
 * /m/sin-plan — la cuenta existe pero no tiene plan activo.
 *
 * Dice el ESTADO y ofrece las dos salidas reales dentro de la app: ir a Ajustes
 * (descargar los datos, borrar la cuenta) o cerrar sesión.
 *
 * Lo que NO hace, y no es un olvido: no menciona planes, precios, Stripe ni «elegí un
 * plan», ni enlaza a /empezar o /suscripcion, ni sugiere «entrá por la web». Dirigir a
 * comprar fuera de la tienda viola Apple 3.1.1 y las Google Payments Policies, y eso
 * incluye el rodeo de mandar al navegador. Hasta que exista IAP, acá solo se informa.
 *
 * No hace falta lógica para salir de esta pantalla: cuando el plan vuelva a estar
 * activo, la guarda del layout deja de redirigir y la app se abre sola.
 */
export const dynamic = "force-dynamic"; // depende de la sesión

export default function MobileSinPlan() {
  return (
    <>
      <MobileHeader title="Tu cuenta" />
      <div className="m-scroll">
        <div className="m-pad">
          <MEmptyState
            icon="protection"
            title="Tu cuenta no tiene un plan activo"
            description="Podés seguir accediendo a tus datos, descargarlos o borrar tu cuenta desde Ajustes."
            actionLabel="Ir a Ajustes"
            actionHref="/m/perfil"
          />
          <form action={signOutAction.bind(null, "/m/login")} style={{ marginTop: 12 }}>
            <button className="m-btn m-btn-block m-btn-secondary" type="submit">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
