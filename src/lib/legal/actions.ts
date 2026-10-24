"use server";

/**
 * Server action del banner de re-aceptación. Vive en su propio archivo porque
 * `aceptacion.ts` exporta además helpers que NO son acciones, y un módulo con
 * `"use server"` obliga a que todo lo exportado sea una función asíncrona expuesta
 * al cliente — no queremos publicar el helper de service-role.
 */
import { revalidarRuta } from "@/lib/revalidation/rutas-espejo";
import { registrarAceptacionDelUsuario } from "@/lib/legal/aceptacion";

export async function aceptarTerminosAction(): Promise<{ ok: boolean }> {
  const r = await registrarAceptacionDelUsuario();
  // Repinta el panel y su gemela móvil: el banner se decide en el servidor, así que
  // sin revalidar seguiría ahí hasta la próxima navegación completa.
  if (r.ok) revalidarRuta("/dashboard");
  return r;
}
