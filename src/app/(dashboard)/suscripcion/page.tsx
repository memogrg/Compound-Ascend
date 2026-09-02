/**
 * /suscripcion — elegir plan, ver el estado de la cuenta y entrar a facturación.
 *
 * Es también el MURO: cuando una cuenta queda en `ninguno` —canceló, o quedó
 * huérfana porque el titular del hogar bajó de plan— el middleware la manda acá.
 * Por eso la página tiene que explicarse sola: alguien puede caer sin haber
 * pedido nada.
 */
import { requireUser } from "@/lib/auth/session";
import { getEstadoSuscripcion } from "@/modules/account/services/subscription-service";
import { stripeConfigurado } from "@/lib/billing/stripe";
import { PlanesPicker } from "@/modules/account/components/planes-picker";
import { FacturacionButton } from "@/modules/account/components/facturacion-button";
import { PLAN_LABEL, TRIAL_DAYS } from "@/lib/plan";

export const dynamic = "force-dynamic";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function SuscripcionPage() {
  const user = await requireUser();
  const e = await getEstadoSuscripcion(user.id);
  const sinPlan = e.plan === "ninguno";

  return (
    <div className="page">
      <header style={{ marginBottom: 26 }}>
        <span className="ov">SUSCRIPCIÓN</span>
        <h1 style={{ margin: "8px 0 0" }}>{sinPlan ? "Elegí tu plan para seguir" : "Tu plan"}</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: "46em", lineHeight: 1.6 }}>
          {sinPlan
            ? "Tu cuenta no tiene una suscripción activa. Tus datos siguen acá, intactos: elegí un plan y volvés a donde estabas. Si preferís no seguir, desde Configuración podés descargar toda tu información."
            : "Todos los planes te ayudan a entender y organizar tus finanzas. Lo que cambia es la profundidad con la que My Agent C+ puede conocerte, recordar tu historia y acompañar tus decisiones."}
        </p>
      </header>

      {!sinPlan ? (
        <div className="card card-pad" style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 15 }}>
            Estás en <strong>{PLAN_LABEL[e.plan]}</strong>
            {e.enPrueba && e.finDePrueba
              ? ` · en prueba hasta el ${fecha(e.finDePrueba)}`
              : e.finDePeriodo
                ? ` · próximo cobro el ${fecha(e.finDePeriodo)}`
                : ""}
          </p>
          {e.planPendiente && e.cambiaEl ? (
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 13.5 }}>
              Programado: pasás a <strong>{PLAN_LABEL[e.planPendiente]}</strong> el{" "}
              {fecha(e.cambiaEl)}. Hasta entonces conservás todo lo de tu plan actual.
            </p>
          ) : null}
          <div style={{ marginTop: 14 }}>
            <FacturacionButton />
          </div>
        </div>
      ) : null}

      {stripeConfigurado() ? (
        <PlanesPicker actual={e.plan} />
      ) : (
        <div className="card card-pad">
          <p style={{ margin: 0 }}>
            El cobro todavía no está habilitado en este entorno. Escribinos y te ayudamos a activar
            tu cuenta.
          </p>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12.5, marginTop: 22 }}>
        {TRIAL_DAYS} días de prueba · No se cobra hasta el día {TRIAL_DAYS + 1} · Cancelás cuando
        querás
      </p>
    </div>
  );
}
