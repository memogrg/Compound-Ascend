import Link from "next/link";
import { redirect } from "next/navigation";
import { MobileHeader } from "../../../components/mobile-header";
import { MContentCard } from "../../../components/content-kit";
import { Paywall } from "../../sin-plan/paywall";
import { getAccountInfo } from "@/modules/account/services/account-service";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { origenDeSuscripcion } from "@/lib/billing/subscription-source";
import { productoDeTienda } from "@/lib/billing/store-products";
import { alVencer } from "@/lib/billing/subscription-detail-rules";
import { formatDateLong } from "@/lib/format";
import { PLAN_LABEL, type Plan } from "@/lib/plan";

/**
 * /m/perfil/plan — cambiar de plan o de período sin salir de la app, para quien paga en la
 * tienda. Es el paywall nativo en modo "cambio".
 *
 * Solo entra quien paga por la tienda con un producto nuestro y usa su propio plan. Stripe no:
 * cambiar en la tienda abriría un segundo cobro. Quien hereda del hogar tampoco: no es lo que
 * paga. Cualquier otro caso vuelve a /m/perfil. Que el dispositivo sea de la misma tienda lo
 * decide el paywall en el cliente.
 *
 * Con un cambio a otro plan pago ya programado no se ofrece otro: el webhook escribe
 * `store_product_id` al recibir PRODUCT_CHANGE aunque el cambio sea diferido, así que en esa
 * ventana el producto guardado es el de destino y no el que Play tiene vivo. Un segundo cambio
 * mandaría ese id como `oldProductIdentifier` y Play lo rechaza. Una cancelación pendiente
 * (`plan_pending = 'ninguno'`) no escribe producto nuevo: ahí el paywall se muestra igual.
 */
export const dynamic = "force-dynamic"; // depende de la sesión

export default async function MobileCambiarPlan() {
  const user = isSupabaseConfigured() ? await getUser() : null;
  if (!user) redirect("/m/perfil");

  // El plan propio y el efectivo, de getAccountInfo: no se lee `profiles.plan` acá.
  const acc = await getAccountInfo();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "store_subscription_active, store_platform, store_product_id, store_period_end, stripe_subscription_id, plan_pending",
    )
    .eq("id", user.id)
    .maybeSingle();

  const producto = productoDeTienda(data?.store_product_id);
  if (
    !data ||
    !data.store_product_id ||
    !producto ||
    acc.planEfectivo !== acc.plan ||
    origenDeSuscripcion({ ...data, plan: acc.plan }) !== "store"
  ) {
    redirect("/m/perfil");
  }

  const pendiente = alVencer({
    plan: acc.plan,
    plan_pending: (data.plan_pending ?? null) as Plan | null,
  });

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader
          variant="inner"
          eyebrow="Configuración"
          title="Cambiar de plan"
          backHref="/m/perfil"
        />
        {pendiente.tipo === "cambia" ? (
          <MContentCard style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontWeight: 600 }} role="status">
              {data.store_period_end
                ? `Ya tenés un cambio a ${PLAN_LABEL[pendiente.a]} programado para el ${formatDateLong(data.store_period_end)}. Podés hacer otro cambio después de esa fecha.`
                : `Ya tenés un cambio a ${PLAN_LABEL[pendiente.a]} programado para cuando termine tu período actual.`}
            </p>
            <Link
              href="/m/perfil"
              className="m-btn m-btn-block m-btn-primary"
              style={{ marginTop: 12 }}
            >
              Volver a Configuración
            </Link>
          </MContentCard>
        ) : (
          <Paywall
            userId={user.id}
            modo="cambio"
            actual={{
              productId: data.store_product_id,
              plan: producto.plan,
              periodo: producto.periodo,
            }}
            plataformaTienda={(data.store_platform as "ios" | "android" | null) ?? null}
            finDePeriodo={data.store_period_end}
          />
        )}
      </div>
    </div>
  );
}
