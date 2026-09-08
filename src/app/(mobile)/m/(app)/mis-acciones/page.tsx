import { getActionPlan, getActionProgress, getDecisionsView } from "@/modules/actions";
import { SurplusDecision } from "@/modules/wealth";
import { MobileHeader } from "../../components/mobile-header";
import { AccionesManager } from "./acciones-manager";

/**
 * /m/mis-acciones — la gemela móvil de "Mis acciones". Mismos motores, mismos números, misma
 * clave de acción: lo que se marca acá desaparece en la web y al revés.
 *
 * El comparador del excedente se renderiza en el servidor (<SurplusDecision/>) y viaja como
 * nodo: en móvil se envuelve para que respire, pero el cálculo es UNO solo. es-MX "tú".
 */
export const dynamic = "force-dynamic"; // datos por sesión

export default async function MobileMisAcciones() {
  const [plan, progress, decisions] = await Promise.all([
    getActionPlan(),
    getActionProgress(),
    getDecisionsView(),
  ]);

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader
          variant="inner"
          eyebrow="Resumen"
          title="Mis acciones"
          backHref="/m"
          backLabel="Volver a Inicio"
        />
        <AccionesManager
          plan={plan}
          progress={progress}
          decisions={decisions}
          comparador={
            <div className="m-acc-embed">
              <SurplusDecision report={decisions.surplus} />
            </div>
          }
        />
      </div>
    </div>
  );
}
