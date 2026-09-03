// Sentry (navegador). Inerte sin NEXT_PUBLIC_SENTRY_DSN, igual que servidor y edge.
//
// Este archivo faltaba. Había config de servidor y de edge, así que los errores de
// render y de las rutas API sí llegaban a Sentry — pero NINGÚN error del navegador,
// porque el SDK del cliente nunca se inicializaba. Todo lo que se rompiera después
// de la hidratación (un click, un formulario, una pantalla que no pinta) no dejaba
// rastro: no es que no hubiera errores, es que nadie los escuchaba.
//
// Next carga este archivo por convención de nombre, desde la raíz del proyecto.
import * as Sentry from "@sentry/nextjs";
import { COMMON_INIT } from "@/lib/observability/sentry-options";

Sentry.init({
  ...COMMON_INIT,
  // Sin replay ni grabación de sesión: es una app financiera y eso filmaría montos,
  // saldos y nombres. Los errores se reportan solos, sin mirar la pantalla del usuario.
  integrations: [],
});

// Instrumenta las navegaciones del App Router: sin esto, un error posterior a un
// cambio de página se reporta contra la ruta anterior y manda a leer el archivo
// equivocado.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
