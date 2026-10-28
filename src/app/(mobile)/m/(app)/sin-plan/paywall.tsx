"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { capacitorPlatform, isCapacitor, type PurchasesPackage } from "@/lib/capacitor/native";
import {
  PRORATION_MODE,
  comprar,
  configurarCompras,
  modoDeCambio,
  obtenerOfertas,
  restaurar,
} from "@/lib/capacitor/purchases";
import {
  tarjetasDelPeriodo,
  type PlanConPeriodos,
  type Tarjeta,
} from "@/lib/billing/store-offerings";
import { PLAN_BENEFITS, PLAN_LABEL, type PaidPlan, type Periodo } from "@/lib/plan";
import { formatDateLong } from "@/lib/format";
import { MContentCard } from "../../components/content-kit";
import { Segmented } from "../../components/form-kit";

/**
 * Paywall nativo de /m/sin-plan: compra dentro de la app (App Store / Google Play) vía
 * RevenueCat. Solo existe dentro de la app; en el navegador no pinta nada y la pantalla queda
 * exactamente como antes.
 *
 * Reglas de tienda (Apple 3.1.1 / 3.1.2, Google Payments), y por eso esta pantalla es así:
 *  · El precio es `product.priceString` tal cual lo da la tienda. Ningún precio nuestro.
 *  · Restaurar compras, enlaces a Términos y Privacidad, y el texto de renovación automática
 *    con cómo cancelar desde la tienda.
 *  · Nada de Stripe, la web ni «más barato en otro lado».
 *  · El ahorro del anual se calcula con los dos precios de la MISMA tienda (`product.price`),
 *    redondeado hacia abajo; si la tienda no trae alguno de los dos, no se dice nada.
 *
 * La compra NO cambia el plan: lo cambia el webhook de RevenueCat. Después de comprar, la
 * pantalla pregunta a /api/account/plan cada 2 s durante 20 s y entra a la app cuando llega.
 *
 * `modo="cambio"` (/m/perfil/plan) es el mismo paywall para quien ya paga en la tienda: la
 * tarjeta de su plan y período queda marcada y deshabilitada, y las demás reemplazan la
 * suscripción (`modoDeCambio`). Subir entra ya y se espera el plan nuevo; bajar o cambiar solo
 * el período entra al vencer lo pagado, así que no se espera nada: se avisa la fecha y se
 * vuelve a Configuración. Una suscripción de Play no se cambia desde un iPhone ni al revés: con
 * otra plataforma los botones quedan deshabilitados.
 */

type Fase =
  "oculto" | "cargando" | "sin-ofertas" | "lista" | "activando" | "pendiente" | "programado";

/** La suscripción de tienda que se está cambiando. */
export type PlanActualTienda = { productId: string; plan: PaidPlan; periodo: Periodo };

const INTERVALO_MS = 2_000;
const ESPERA_MAX_MS = 20_000;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const OPCIONES_PERIODO = [
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];
const POR: Record<Periodo, string> = { mensual: "por mes", anual: "por año" };
const CADA: Record<Periodo, string> = { mensual: "cada mes", anual: "cada año" };

async function planActual(): Promise<string | null> {
  try {
    const res = await fetch("/api/account/plan", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { plan?: unknown };
    return typeof body.plan === "string" ? body.plan : null;
  } catch {
    return null;
  }
}

export function Paywall({
  userId,
  modo = "alta",
  actual,
  plataformaTienda = null,
  finDePeriodo = null,
}: {
  userId: string;
  modo?: "alta" | "cambio";
  /** Solo en modo "cambio": el plan y período que se pagan hoy. */
  actual?: PlanActualTienda;
  /** Solo en modo "cambio": la tienda donde se pagó (`store_platform`). */
  plataformaTienda?: "ios" | "android" | null;
  /** Solo en modo "cambio": fin del período pagado (`store_period_end`), para el aviso. */
  finDePeriodo?: string | null;
}) {
  const router = useRouter();
  const enCambio = modo === "cambio" && actual !== undefined;
  const [fase, setFase] = useState<Fase>("oculto");
  const [ofertas, setOfertas] = useState<PlanConPeriodos<PurchasesPackage>[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>(actual?.periodo ?? "mensual");
  // Se decide en el cliente: el servidor no sabe desde qué dispositivo se abre la pantalla.
  const [mismaPlataforma, setMismaPlataforma] = useState(!enCambio);
  // Por id de paquete: el mismo plan tiene un paquete mensual y otro anual.
  const [comprando, setComprando] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    if (!isCapacitor()) return;
    if (enCambio) setMismaPlataforma(capacitorPlatform() === plataformaTienda);
    setFase("cargando");
    void (async () => {
      await configurarCompras(userId);
      const lista = await obtenerOfertas().catch(() => []);
      if (!vivo.current) return;
      setOfertas(lista);
      setFase(lista.length > 0 ? "lista" : "sin-ofertas");
    })();
    return () => {
      vivo.current = false;
    };
  }, [userId, enCambio, plataformaTienda]);

  /** Espera a que el webhook escriba el plan: cualquiera pago, o `objetivo` si es un cambio. */
  const esperarPlan = useCallback(
    async (objetivo?: PaidPlan) => {
      setFase("activando");
      setAviso(null);
      for (let t = 0; t < ESPERA_MAX_MS; t += INTERVALO_MS) {
        const plan = await planActual();
        if (!vivo.current) return;
        if (objetivo ? plan === objetivo : plan && plan !== "ninguno") {
          router.replace("/m");
          router.refresh();
          return;
        }
        await esperar(INTERVALO_MS);
        if (!vivo.current) return;
      }
      setFase("pendiente");
    },
    [router],
  );

  const suscribirme = async (o: Tarjeta<PurchasesPackage>) => {
    setComprando(o.paquete.identifier);
    setAviso(null);
    const modoCambio = enCambio ? modoDeCambio(actual, { plan: o.plan, periodo }) : null;
    const r = await comprar(
      o.paquete,
      enCambio && modoCambio !== null
        ? { productoActual: actual.productId, prorationMode: modoCambio }
        : undefined,
    );
    if (!vivo.current) return;
    setComprando(null);
    if (!r.ok) {
      if ("error" in r) setAviso(r.error);
      return;
    }
    if (!enCambio) return void esperarPlan();
    // Diferido, o solo otro período del mismo plan: el plan efectivo no cambia hoy.
    if (modoCambio === PRORATION_MODE.DEFERRED || o.plan === actual.plan) {
      return setFase("programado");
    }
    void esperarPlan(o.plan);
  };

  const restaurarCompras = async () => {
    setRestaurando(true);
    setAviso(null);
    const r = await restaurar();
    if (!vivo.current) return;
    setRestaurando(false);
    if (!r.ok) return setAviso(r.error);
    if (r.activa) return void (enCambio ? router.refresh() : esperarPlan());
    setAviso("No encontramos compras para restaurar en esta cuenta de la tienda.");
  };

  if (fase === "oculto") return null;

  const ocupado = comprando !== null || restaurando;
  const tarjetas = tarjetasDelPeriodo(ofertas, periodo);
  // El selector solo aparece si la tienda trae algún anual; si no, es el paywall de siempre.
  const hayAnual = ofertas.some((g) => g.anual !== null);

  if (fase === "activando") {
    return (
      <MContentCard style={{ marginTop: 14 }}>
        <p style={{ margin: 0, fontWeight: 600 }} role="status">
          Estamos activando tu plan…
        </p>
      </MContentCard>
    );
  }

  if (fase === "programado") {
    return (
      <MContentCard style={{ marginTop: 14 }}>
        <p style={{ margin: 0, fontWeight: 600 }} role="status">
          {finDePeriodo
            ? `Tu cambio se aplica el ${formatDateLong(finDePeriodo)}.`
            : "Tu cambio se aplica cuando termine tu período actual."}
        </p>
        <button
          type="button"
          className="m-btn m-btn-block m-btn-primary"
          style={{ marginTop: 12 }}
          onClick={() => {
            router.replace("/m/perfil");
            router.refresh();
          }}
        >
          Volver a Configuración
        </button>
      </MContentCard>
    );
  }

  if (fase === "pendiente") {
    return (
      <MContentCard style={{ marginTop: 14 }}>
        <p style={{ margin: 0, fontWeight: 600 }} role="status">
          Tu compra se registró; el plan se activa en unos minutos.
        </p>
        <button
          type="button"
          className="m-btn m-btn-block m-btn-primary"
          style={{ marginTop: 12 }}
          onClick={() => void esperarPlan()}
        >
          Actualizar
        </button>
      </MContentCard>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      {fase === "cargando" ? (
        <>
          <div className="m-skel" style={{ height: 150, marginBottom: 12 }} aria-hidden />
          <div className="m-skel" style={{ height: 150, marginBottom: 12 }} aria-hidden />
          <div className="m-skel" style={{ height: 150, marginBottom: 12 }} aria-hidden />
        </>
      ) : fase === "sin-ofertas" ? (
        <MContentCard style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}>No pudimos cargar los planes. Intentá más tarde.</p>
        </MContentCard>
      ) : (
        <>
          {hayAnual ? (
            <Segmented
              name="periodo"
              label="Período de pago"
              value={periodo}
              onChange={(v) => setPeriodo(v === "anual" ? "anual" : "mensual")}
              options={OPCIONES_PERIODO}
            />
          ) : null}
          {enCambio && !mismaPlataforma ? (
            <p className="muted" role="note" style={{ fontSize: 13, margin: "0 0 12px" }}>
              Tu suscripción es de {plataformaTienda === "ios" ? "App Store" : "Google Play"}: el
              cambio se hace desde un dispositivo con esa tienda.
            </p>
          ) : null}
          {tarjetas.map((o) => {
            const esActual = enCambio && o.plan === actual.plan && periodo === actual.periodo;
            return (
              <MContentCard key={o.paquete.identifier} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{PLAN_LABEL[o.plan]}</div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 20 }}>
                    {o.paquete.product.priceString}
                  </span>{" "}
                  <span className="muted" style={{ fontSize: 13 }}>
                    {POR[periodo]}
                  </span>
                </div>
                {o.ahorro !== null ? (
                  <div
                    style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: "var(--success)" }}
                  >
                    Ahorrás {o.ahorro}% frente a pagar mes a mes
                  </div>
                ) : null}
                <ul
                  style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5 }}
                >
                  {PLAN_BENEFITS[o.plan].slice(0, 3).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="m-btn m-btn-block m-btn-primary"
                  style={{ marginTop: 12 }}
                  disabled={ocupado || esActual || !mismaPlataforma}
                  onClick={() => void suscribirme(o)}
                >
                  {comprando === o.paquete.identifier
                    ? "Abriendo la tienda…"
                    : esActual
                      ? "Tu plan actual"
                      : enCambio
                        ? "Cambiar"
                        : "Suscribirme"}
                </button>
              </MContentCard>
            );
          })}
        </>
      )}

      {aviso ? (
        <p role="alert" style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--danger)" }}>
          {aviso}
        </p>
      ) : null}

      <button
        type="button"
        className="m-btn m-btn-block m-btn-ghost"
        disabled={ocupado || fase === "cargando"}
        onClick={() => void restaurarCompras()}
      >
        {restaurando ? "Restaurando…" : "Restaurar compras"}
      </button>

      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: "12px 0 6px" }}>
        La suscripción se renueva automáticamente {CADA[periodo]} hasta que la cancelés desde los
        ajustes de tu App Store o Google Play, al menos 24 horas antes del fin del período.
      </p>
      <p style={{ fontSize: 12, margin: 0 }}>
        <Link href="/terminos">Términos y condiciones</Link> ·{" "}
        <Link href="/privacidad">Política de privacidad</Link>
      </p>
    </div>
  );
}
