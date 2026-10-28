"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isCapacitor, type PurchasesPackage } from "@/lib/capacitor/native";
import { comprar, configurarCompras, obtenerOfertas, restaurar } from "@/lib/capacitor/purchases";
import type { PaqueteConPlan } from "@/lib/billing/store-offerings";
import { PLAN_BENEFITS, PLAN_LABEL, type PaidPlan } from "@/lib/plan";
import { MContentCard } from "../../components/content-kit";

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
 *
 * La compra NO cambia el plan: lo cambia el webhook de RevenueCat. Después de comprar, la
 * pantalla pregunta a /api/account/plan cada 2 s durante 20 s y entra a la app cuando llega.
 */

type Fase = "oculto" | "cargando" | "sin-ofertas" | "lista" | "activando" | "pendiente";

const INTERVALO_MS = 2_000;
const ESPERA_MAX_MS = 20_000;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

export function Paywall({ userId }: { userId: string }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("oculto");
  const [ofertas, setOfertas] = useState<PaqueteConPlan<PurchasesPackage>[]>([]);
  const [comprando, setComprando] = useState<PaidPlan | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    if (!isCapacitor()) return;
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
  }, [userId]);

  const esperarPlan = useCallback(async () => {
    setFase("activando");
    setAviso(null);
    for (let t = 0; t < ESPERA_MAX_MS; t += INTERVALO_MS) {
      const plan = await planActual();
      if (!vivo.current) return;
      if (plan && plan !== "ninguno") {
        router.replace("/m");
        router.refresh();
        return;
      }
      await esperar(INTERVALO_MS);
      if (!vivo.current) return;
    }
    setFase("pendiente");
  }, [router]);

  const suscribirme = async (o: PaqueteConPlan<PurchasesPackage>) => {
    setComprando(o.plan);
    setAviso(null);
    const r = await comprar(o.paquete);
    if (!vivo.current) return;
    setComprando(null);
    if (r.ok) return void esperarPlan();
    if ("error" in r) setAviso(r.error);
  };

  const restaurarCompras = async () => {
    setRestaurando(true);
    setAviso(null);
    const r = await restaurar();
    if (!vivo.current) return;
    setRestaurando(false);
    if (!r.ok) return setAviso(r.error);
    if (r.activa) return void esperarPlan();
    setAviso("No encontramos compras para restaurar en esta cuenta de la tienda.");
  };

  if (fase === "oculto") return null;

  const ocupado = comprando !== null || restaurando;

  if (fase === "activando") {
    return (
      <MContentCard style={{ marginTop: 14 }}>
        <p style={{ margin: 0, fontWeight: 600 }} role="status">
          Estamos activando tu plan…
        </p>
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
        ofertas.map((o) => (
          <MContentCard key={o.paquete.identifier} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{PLAN_LABEL[o.plan]}</div>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 20 }}>{o.paquete.product.priceString}</span>{" "}
              <span className="muted" style={{ fontSize: 13 }}>
                por mes
              </span>
            </div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5 }}>
              {PLAN_BENEFITS[o.plan].slice(0, 3).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <button
              type="button"
              className="m-btn m-btn-block m-btn-primary"
              style={{ marginTop: 12 }}
              disabled={ocupado}
              onClick={() => void suscribirme(o)}
            >
              {comprando === o.plan ? "Abriendo la tienda…" : "Suscribirme"}
            </button>
          </MContentCard>
        ))
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
        La suscripción se renueva automáticamente cada mes hasta que la cancelés desde los ajustes
        de tu App Store o Google Play, al menos 24 horas antes del fin del período.
      </p>
      <p style={{ fontSize: 12, margin: 0 }}>
        <Link href="/terminos">Términos y condiciones</Link> ·{" "}
        <Link href="/privacidad">Política de privacidad</Link>
      </p>
    </div>
  );
}
