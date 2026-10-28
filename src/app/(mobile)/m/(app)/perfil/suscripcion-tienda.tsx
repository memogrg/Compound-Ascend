"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { capacitorPlatform, isCapacitor } from "@/lib/capacitor/native";
import { restaurar, urlDeGestion } from "@/lib/capacitor/purchases";
import { abrirGestionTienda, refrescarAlVolver } from "./gestion-tienda";
import type { OrigenSuscripcion } from "@/lib/billing/subscription-source";
import { MContentCard, MDataRow, MSectionHeader } from "../../components/content-kit";

/** Las páginas de suscripciones de cada tienda, por si RevenueCat no da `managementURL`. */
const GESTION_TIENDA = {
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions?package=com.compoundascend.cartera",
} as const;

/**
 * Sección «Suscripción» de Ajustes, solo dentro de la app nativa (en el navegador no pinta
 * nada). Gestionar abre la página de suscripciones de la tienda; Restaurar recupera una compra
 * hecha con la misma cuenta de la tienda.
 *
 * Si la cuenta paga por Stripe no se ofrecen filas de tienda: comprar o restaurar en la tienda
 * abriría un segundo cobro. Solo se dice que el plan está activo, sin nombrar dónde se paga.
 */
export function SuscripcionTienda({ origen }: { origen: OrigenSuscripcion }) {
  const router = useRouter();
  const [nativo, setNativo] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    setNativo(isCapacitor());
  }, []);

  if (!nativo) return null;

  const gestionar = async () => {
    const plataforma = capacitorPlatform();
    const url =
      (await urlDeGestion()) ?? (plataforma === "web" ? null : GESTION_TIENDA[plataforma]);
    if (!url) return;
    refrescarAlVolver(() => router.refresh());
    await abrirGestionTienda(url);
  };

  const restaurarCompras = async () => {
    setRestaurando(true);
    setAviso(null);
    const r = await restaurar();
    setRestaurando(false);
    if (!r.ok) return setAviso(r.error);
    setAviso(
      r.activa
        ? "Listo: encontramos tu suscripción. Tu plan se actualiza en unos momentos."
        : "No encontramos compras para restaurar en esta cuenta de la tienda.",
    );
    if (r.activa) router.refresh();
  };

  return (
    <>
      <MSectionHeader title="Suscripción" />
      <MContentCard style={{ marginBottom: 14 }}>
        {origen === "stripe" ? (
          <MDataRow title="Tu plan está activo" />
        ) : (
          <>
            <MDataRow
              title="Gestionar suscripción"
              subtitle="Cambiar de plan o cancelar en la tienda"
              chevron
              onClick={() => void gestionar()}
            />
            <MDataRow
              title={restaurando ? "Restaurando…" : "Restaurar compras"}
              subtitle="Recupera una suscripción hecha con esta cuenta de la tienda"
              onClick={restaurando ? undefined : () => void restaurarCompras()}
            />
          </>
        )}
        {aviso ? (
          <p role="status" className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            {aviso}
          </p>
        ) : null}
      </MContentCard>
    </>
  );
}
