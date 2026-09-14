import { notFound } from "next/navigation";

/**
 * Catch-all de /m: cualquier URL que no calce con una ruta real cae acá y lanza
 * notFound(), que lo atiende m/not-found.tsx.
 *
 * Hace falta porque un not-found.tsx anidado atrapa los `notFound()` de su subárbol,
 * pero una URL desconocida bajo /m/ SIN catch-all no entra al subárbol: no calza con
 * ningún segmento, así que Next la resuelve en la raíz y la atiende app/not-found.tsx
 * —el 404 de escritorio, con su enlace a /dashboard—.
 *
 * Va FUERA del grupo (app) a propósito: una URL rota no debe pedir login ni pasar por
 * la guarda de plan. Quien escribió mal una dirección merece un "no existe", no un
 * formulario de acceso ni un muro.
 *
 * Al ser catch-all tiene la prioridad más baja del enrutador, así que no le quita
 * ninguna ruta real: /m/deudas, /m/perfil y el resto siguen resolviendo a su página.
 */
export default function MobileCatchAll() {
  notFound();
}
