import { notFound } from "next/navigation";

import {
  ControlWizard,
  CrecimientoWizard,
  DefensaWizard,
  PresupuestoWizard,
  getSetupSnapshot,
  isSetupWizardId,
} from "@/modules/setup";

/**
 * /configurar/[wizard] — los cuatro asistentes de configuración (web).
 *
 * La página es un Server Component que lee el ESTADO REAL una sola vez y se lo
 * pasa al asistente. No hay borrador ni sesión de wizard: al reentrar, cada
 * paso abre con lo que ya existe porque lo que se pinta ES la entidad. Los
 * pasos escriben con los actions de la app y piden `router.refresh()`, que
 * vuelve a ejecutar esta función.
 */
export const dynamic = "force-dynamic"; // datos por sesión

export default async function ConfigurarPage({ params }: { params: Promise<{ wizard: string }> }) {
  const { wizard } = await params;
  if (!isSetupWizardId(wizard)) notFound();

  const snapshot = await getSetupSnapshot();
  const exitHref = "/dashboard";

  switch (wizard) {
    case "presupuesto":
      return <PresupuestoWizard snapshot={snapshot} exitHref={exitHref} />;
    case "control":
      return <ControlWizard snapshot={snapshot} exitHref={exitHref} />;
    case "defensa":
      return <DefensaWizard snapshot={snapshot} exitHref={exitHref} />;
    case "crecimiento":
      return <CrecimientoWizard snapshot={snapshot} exitHref={exitHref} />;
  }
}
