"use client";

/**
 * Panel de avisos de ritmo del tab de Gastos. Envuelve las tarjetas y refresca la pantalla
 * cuando una salida se aplica (mover presupuesto cambia las cifras de los frascos que están
 * justo debajo).
 *
 * Recibe las señales YA CALCULADAS desde el servidor en vez de pedirlas al montar. Dos
 * razones: no hay parpadeo —las tarjetas están en el primer render, no aparecen medio segundo
 * después empujando los frascos hacia abajo— y no se paga un viaje extra en una pantalla que
 * ya trae todos estos datos. El pop-up del ritmo (rhythm-nudge) sí consulta al montar, porque
 * vive en el layout y no tiene una página que le pase nada.
 *
 * Tope de 2 tarjetas: con una por sobre, un mes flojo llena la pantalla de avisos y el usuario
 * los cierra todos sin leer ninguno. Mismo criterio que el detector.
 */
import { useRouter } from "next/navigation";

import {
  RitmoSobreCard,
  RITMO_SKIN_WEB,
  RITMO_SKIN_MOBILE,
  type RitmoSkin,
} from "@/components/shared/ritmo-sobre-card";
import type { SenalRitmo } from "@/lib/rhythm/spend-pace";

const MAX_TARJETAS = 2;

export function RitmoPanel({
  senales,
  dia,
  superficie = "web",
}: {
  senales: SenalRitmo[];
  dia: number;
  superficie?: "web" | "movil";
}) {
  const router = useRouter();
  if (senales.length === 0) return null;

  const skin: RitmoSkin = superficie === "movil" ? RITMO_SKIN_MOBILE : RITMO_SKIN_WEB;
  const voz = superficie === "movil" ? "tu" : "vos";
  const refrescar = () => router.refresh();

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {senales.slice(0, MAX_TARJETAS).map((senal) => (
        <RitmoSobreCard
          key={senal.categoryId}
          senal={senal}
          dia={dia}
          skin={skin}
          voz={voz}
          onApplied={refrescar}
        />
      ))}
    </div>
  );
}
