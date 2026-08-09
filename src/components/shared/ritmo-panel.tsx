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
import { SobreOciosoCard } from "@/components/shared/sobre-ocioso-card";
import type { SenalRitmo } from "@/lib/rhythm/spend-pace";
import type { SobreOcioso } from "@/lib/rhythm/idle-envelopes";

const MAX_TARJETAS = 2;

/**
 * Tope conjunto de tarjetas (ritmo + ociosos). Dos avisos de ritmo MÁS dos de ociosos serían
 * cuatro tarjetas antes de los frascos: el usuario tendría que hacer scroll para llegar a su
 * propia pantalla, y eso es lo que convierte los avisos en algo que se cierra sin leer.
 */
const MAX_TOTAL = 3;

export function RitmoPanel({
  senales,
  ociosos = [],
  dia,
  superficie = "web",
}: {
  senales: SenalRitmo[];
  ociosos?: SobreOcioso[];
  dia: number;
  superficie?: "web" | "movil";
}) {
  const router = useRouter();
  if (senales.length === 0 && ociosos.length === 0) return null;

  const skin: RitmoSkin = superficie === "movil" ? RITMO_SKIN_MOBILE : RITMO_SKIN_WEB;
  const voz = superficie === "movil" ? "tu" : "vos";
  const refrescar = () => router.refresh();

  // El ritmo va PRIMERO y se lleva los cupos: es del mes en curso y todavía se puede hacer
  // algo al respecto. Un sobre ocioso es una conclusión sobre tres meses — sigue siendo verdad
  // mañana, y puede esperar.
  const deRitmo = senales.slice(0, MAX_TARJETAS);
  const deOciosos = ociosos.slice(0, Math.max(0, MAX_TOTAL - deRitmo.length));

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {deRitmo.map((senal) => (
        <RitmoSobreCard
          key={senal.categoryId}
          senal={senal}
          dia={dia}
          skin={skin}
          voz={voz}
          onApplied={refrescar}
        />
      ))}
      {deOciosos.map((o) => (
        <SobreOciosoCard
          key={o.categoryId}
          ocioso={o}
          skin={skin}
          voz={voz}
          onApplied={refrescar}
        />
      ))}
    </div>
  );
}
