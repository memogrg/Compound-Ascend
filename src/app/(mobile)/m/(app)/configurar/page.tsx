import { SetupHubFull, getSetupProgress, setupOverall } from "@/modules/setup";
import { MobileHeader } from "../../components/mobile-header";
import { MSectionHeader } from "../../components/content-kit";

/**
 * /m/configurar — índice de los cuatro asistentes (móvil).
 *
 * Paridad con /configurar: mismo motor, mismo estado derivado, misma lista. Es
 * la ENTRADA ESTABLE del móvil (el menú ☰ apunta acá), para no depender de que
 * el hub del Inicio esté visible.
 */
export const dynamic = "force-dynamic"; // datos por sesión

export default async function MobileConfigurarIndexPage() {
  // Best-effort, igual que la web: llegar al asistente no puede depender de que
  // el resumen cargue.
  const progress = await getSetupProgress().catch(() => []);
  const { done, total, allReady } = setupOverall(progress);

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader
          variant="inner"
          eyebrow="Configuración"
          title="Mi configuración"
          backHref="/m"
          backLabel="Volver a Inicio"
        />

        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
          {allReady
            ? "Todo está configurado. Entra a cualquiera para ajustar lo que quieras."
            : "Cuatro asistentes para armar tu sistema. Puedes entrar y salir cuando quieras."}
        </p>

        {progress.length > 0 ? (
          <>
            <MSectionHeader title="Tus asistentes" action={`${done}/${total} listos`} />
            <SetupHubFull progress={progress} mobile />
          </>
        ) : (
          <div className="setup-empty">
            No pudimos leer tu configuración en este momento. Desliza para recargar y reintentar.
          </div>
        )}
      </div>
    </div>
  );
}
