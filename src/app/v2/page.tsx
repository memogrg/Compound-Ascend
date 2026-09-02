import type { Metadata } from "next";
import { LandingV2 } from "@/components/marketing/v2/landing-v2";

/**
 * VITRINA DEL LANDING v2 — convive con el landing viejo hasta que se decida el cambio.
 *
 * Va en `/v2` a propósito y no reemplaza la raíz todavía: así se puede comparar lado a lado y
 * mandarle el enlace a alguien sin tocar lo que ve el público. Cuando la dirección quede aprobada,
 * este archivo desaparece y `LandingV2` pasa a montarse desde `src/app/page.tsx`.
 *
 * A diferencia de la raíz, acá NO se redirige al panel cuando hay sesión: quien está revisando el
 * diseño casi siempre está logueado, y rebotarlo al dashboard haría la página imposible de ver.
 */

export const metadata: Metadata = {
  title: "CARTERA+ — Tu plata, con dirección.",
  description:
    "CARTERA+ ordena tus gastos, te saca de las deudas en el orden que menos intereses paga, y te enseña el patrimonio subiendo. Con los números a la vista, siempre.",
  // Mientras sea una vitrina de trabajo no tiene por qué competir con la raíz en buscadores.
  robots: { index: false, follow: false },
};

export default function LandingV2Page() {
  return <LandingV2 />;
}
