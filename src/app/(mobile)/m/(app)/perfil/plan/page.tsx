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
import { PLAN_LABEL, type PaidPlan, type Periodo, type Plan } from "@/lib/plan";

/**
 * /m/perfil/plan — cambiar de plan o de período sin salir de la app, para quien paga en la
 * tienda. Es el paywall nativo en modo "cambio".
 *
 * Solo entra quien paga por la tienda con un producto nuestro y usa su propio plan. Stripe no:
 * cambiar en la tienda abriría un segundo cobro. Quien hereda del hogar tampoco: no es lo que
 * paga. Cualquier otro caso vuelve a /m/perfil. Que el dispositivo sea de la misma tienda lo
 * decide el paywall en el cliente.
 *
 * Con un cambio ya programado no se ofrece otro hasta que entre: un cambio diferido deja el
 * producto nuevo en `store_product_pending` (o, en cuentas de antes de esa columna, una bajada
 * en `plan_pending`). Un segundo reemplazo encima de uno que no entró deja el «actual» y el
 * «pendiente» que guardamos sin corresponder a lo que tiene la tienda. Una cancelación pendiente
 * (`plan_pending = 'ninguno'`) no es un cambio de producto: ahí el paywall se muestra igual.
 */
export const dynamic = "force-dynamic"; // depende de la sesión

/** El aviso de un cambio ya programado, o null si no hay ninguno. */
function avisoDeCambioProgramado(p: {
  actual: { plan: PaidPlan; periodo: Periodo };
  pendiente: { plan: PaidPlan; periodo: Periodo } | null;
  hayPendienteDesconocido: boolean;
  bajadaA: PaidPlan | null;
  fin: string | null;
}): string | null {
  const cuando = p.fin ? `el ${formatDateLong(p.fin)}` : "cuando termine tu período actual";
  const despues = p.fin ? " Podés hacer otro cambio después de esa fecha." : "";
  if (p.pendiente && p.pendiente.plan === p.actual.plan) {
    return `Ya tenés el cambio a ${PLAN_LABEL[p.pendiente.plan]} ${p.pendiente.periodo} programado para ${cuando}.${despues}`;
  }
  const a = p.pendiente?.plan ?? p.bajadaA;
  if (a) return `Ya tenés un cambio a ${PLAN_LABEL[a]} programado para ${cuando}.${despues}`;
  if (p.hayPendienteDesconocido) return `Ya tenés un cambio programado para ${cuando}.${despues}`;
  return null;
}

export default async function MobileCambiarPlan() {
  const user = isSupabaseConfigured() ? await getUser() : null;
  if (!user) redirect("/m/perfil");

  // El plan propio y el efectivo, de getAccountInfo: no se lee `profiles.plan` acá.
  const acc = await getAccountInfo();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "store_subscription_active, store_platform, store_product_id, store_product_pending, store_period_end, stripe_subscription_id, plan_pending",
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

  const alVencerPlan = alVencer({
    plan: acc.plan,
    plan_pending: (data.plan_pending ?? null) as Plan | null,
  });
  const aviso = avisoDeCambioProgramado({
    actual: producto,
    pendiente: productoDeTienda(data.store_product_pending),
    hayPendienteDesconocido: data.store_product_pending !== null,
    bajadaA: alVencerPlan.tipo === "cambia" ? alVencerPlan.a : null,
    fin: data.store_period_end,
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
        {aviso ? (
          <MContentCard style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontWeight: 600 }} role="status">
              {aviso}
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
