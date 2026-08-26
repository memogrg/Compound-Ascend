import { notFound } from "next/navigation";

import {
  ControlWizard,
  CrecimientoWizard,
  DefensaWizard,
  PresupuestoWizard,
  getSetupSnapshot,
  isSetupWizardId,
} from "@/modules/setup";
import { MobileHeader } from "../../../components/mobile-header";

/**
 * /m/configurar/[wizard] — los MISMOS cuatro asistentes que la web.
 *
 * Paridad real: se monta el mismo componente con `skin="mobile"`, así que los
 * pasos, las validaciones, las sugerencias y los actions son idénticos; lo
 * único distinto es la piel (mobile.css) y el destino de "Después".
 */
export const dynamic = "force-dynamic"; // datos por sesión

const TITLES: Record<string, string> = {
  presupuesto: "Presupuesto",
  control: "Control",
  defensa: "Defensa",
  crecimiento: "Crecimiento",
};

export default async function MobileConfigurarPage({
  params,
}: {
  params: Promise<{ wizard: string }>;
}) {
  const { wizard } = await params;
  if (!isSetupWizardId(wizard)) notFound();

  const snapshot = await getSetupSnapshot();
  const exitHref = "/m";

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader
          variant="inner"
          eyebrow="Configuración"
          title={TITLES[wizard] ?? "Configuración"}
          backHref="/m"
          backLabel="Volver a Inicio"
        />
        {wizard === "presupuesto" ? (
          <PresupuestoWizard snapshot={snapshot} skin="mobile" exitHref={exitHref} />
        ) : wizard === "control" ? (
          <ControlWizard snapshot={snapshot} skin="mobile" exitHref={exitHref} />
        ) : wizard === "defensa" ? (
          <DefensaWizard snapshot={snapshot} skin="mobile" exitHref={exitHref} />
        ) : (
          <CrecimientoWizard snapshot={snapshot} skin="mobile" exitHref={exitHref} />
        )}
      </div>
    </div>
  );
}
