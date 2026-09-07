import { Faqs } from "@/components/marketing/v3/faqs";
import { getUser } from "@/lib/auth/session";

export const metadata = {
  title: "Preguntas frecuentes — CARTERA+",
  description:
    "Cómo entran tus datos, cómo se manejan las dos monedas, cómo se calcula la salida de tus deudas y qué hace exactamente My Agent C+. Sin letra chica.",
};

/**
 * Página pública. No está detrás del muro de suscripción a propósito: alguien
 * que todavía no se registró tiene que poder leerla entera antes de decidir.
 */
export default async function FaqsPage() {
  // Misma regla que la landing: con sesión, un solo botón «Ir a mi panel».
  const user = await getUser();
  return <Faqs conSesion={Boolean(user)} />;
}
