import { SetupHubFull, getSetupProgress, setupOverall } from "@/modules/setup";

/**
 * /configurar — índice de los cuatro asistentes (web).
 *
 * Es la ENTRADA ESTABLE: la navegación apunta acá, así que llegar a los
 * asistentes no depende de que una tarjeta del panel esté visible. Existe
 * siempre, con la configuración vacía o completa — el asistente también sirve
 * para modificar.
 *
 * No agrega estado propio: `getSetupProgress` deriva todo del dato real, igual
 * que el hub del panel.
 */
export const dynamic = "force-dynamic"; // datos por sesión

export default async function ConfigurarIndexPage() {
  // Best-effort: si la lectura falla, se pintan igual los cuatro accesos con su
  // estado desconocido en vez de dejar la pantalla vacía — llegar al asistente
  // no puede depender de que el resumen cargue.
  const progress = await getSetupProgress().catch(() => []);
  const { done, total, allReady } = setupOverall(progress);

  return (
    <div className="grid">
      <div>
        <h2 className="greet">
          Mi <span className="it">configuración</span>
        </h2>
        <p className="greet-sub">
          {allReady
            ? "Todo está configurado. Entrá a cualquiera para ajustar lo que quieras."
            : "Cuatro asistentes para armar tu sistema. Podés entrar y salir cuando quieras."}
        </p>
      </div>

      {progress.length > 0 ? (
        <>
          <div className="setup-hub-count">
            {done}/{total} listos
          </div>
          <SetupHubFull progress={progress} />
        </>
      ) : (
        <div className="setup-empty">
          No pudimos leer tu configuración en este momento. Recargá la página para reintentar.
        </div>
      )}
    </div>
  );
}
