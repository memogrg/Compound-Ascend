import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";

import { MobileAssistant } from "./mobile-assistant";

/**
 * Asistente IA en móvil (/m/asistente). Fuera del grupo (app) → pantalla completa sin
 * tab bar (la barra de entrada fija vive abajo), pero requiere sesión: guarda aquí
 * (misma cookie que la web) y redirige a /m/login si no hay. El chat y el escáner de
 * recibos reutilizan los endpoints del módulo assistant (ver mobile-assistant.tsx).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Asistente IA · CARTERA+" };

export default async function MobileAsistente() {
  const user = await getUser();
  if (!user) redirect("/m/login");

  return <MobileAssistant />;
}
