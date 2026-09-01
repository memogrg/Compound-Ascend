import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";
import { getPrimaryCurrency } from "@/modules/financial-base";
import { knownUserTz } from "@/lib/time/user-time";

import { MobileAssistant } from "./mobile-assistant";

/**
 * Asistente IA en móvil (/m/asistente). Fuera del grupo (app) → pantalla completa sin
 * tab bar (la barra de entrada fija vive abajo), pero requiere sesión: guarda aquí
 * (misma cookie que la web) y redirige a /m/login si no hay. El chat y el escáner de
 * recibos reutilizan los endpoints del módulo assistant (ver mobile-assistant.tsx).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Asistente IA · CARTERA+" };

export default async function MobileAsistente({
  searchParams,
}: {
  searchParams: Promise<{ consulta?: string }>;
}) {
  const { consulta } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/m/login");

  // La PRINCIPAL (no la de visualización del topbar): es la moneda con la que se captura.
  // Va por prop, igual que la zona horaria, porque esta ruta vive FUERA del grupo (app),
  // que es donde se montan CurrencyProvider y TimezoneProvider.
  const [primaryCurrency, timezone] = await Promise.all([
    getPrimaryCurrency(),
    knownUserTz().catch(() => null),
  ]);
  return (
    <MobileAssistant
      primaryCurrency={primaryCurrency}
      timezone={timezone}
      initialDraft={consulta}
    />
  );
}
