/**
 * COPY del pop-up de ritmo. Puro y compartido por web y móvil — sin `server-only`, sin
 * JSX: es lo único que las dos superficies tienen que decir igual.
 *
 * Se comparte el TEXTO, no el componente. Web y móvil tienen primitivos distintos (Modal
 * vs BottomSheet, `btn` vs `m-btn`) y forzar un componente común obligaría a un
 * abstracto que no le sirve bien a ninguno. Lo que sí sería un error es que el mismo
 * aviso dijera cosas distintas según el dispositivo.
 *
 * ── VOZ ─────────────────────────────────────────────────────────────────────
 * Web es VOSEO ("ajustá", "tenés"); móvil es es-MX de "tú" ("ajusta", "tienes"). `vos()`
 * marca SOLO las frases donde la conjugación cambia — la mayoría del copy es idéntica en
 * las dos voces, y duplicarla entera haría que se desincronizara al primer retoque.
 *
 * ── TONO: ACOMPAÑAR, NO REGAÑAR ─────────────────────────────────────────────
 * Tres reglas que se aplican a todo lo de abajo:
 *  1. Nada de cuentas regresivas alarmistas ni signos de admiración.
 *  2. El costo se enuncia como beneficio de actuar, no como amenaza por no hacerlo
 *     ("un minuto ahora te ahorra reconstruir el mes", no "vas a perder el registro").
 *  3. Ninguna frase presupone que el usuario falló. Un sobre sin movimientos puede ser
 *     el seguro que se paga en marzo, y el que no registró hoy pudo no haber gastado.
 */
export type Voz = "vos" | "tu";

export type NudgeKind = "ventana_presupuesto" | "cierre_mes" | "registro_diario";

export type NudgeCopy = {
  kind: NudgeKind;
  titulo: string;
  cuerpo: string;
  /** Texto del botón principal. */
  cta: string;
  /** Texto del botón secundario (descartar por hoy). */
  descartar: string;
};

/** Elige la conjugación. Usar SOLO cuando las dos voces difieren de verdad. */
const vos = (voz: Voz, voseo: string, tuteo: string): string => (voz === "vos" ? voseo : tuteo);

/** Aviso de ventana abierta (días 1-5). */
export function copyVentana(args: {
  voz: Voz;
  mes: string;
  diasRestantes: number;
  sobresConPresupuesto: number;
}): NudgeCopy {
  const { voz, mes, diasRestantes } = args;

  const base =
    args.sobresConPresupuesto === 0
      ? vos(
          voz,
          `Todavía no repartiste tu presupuesto de ${mes}.`,
          `Todavía no repartes tu presupuesto de ${mes}.`,
        )
      : `Este es el momento de acomodar tus sobres a lo que viene en ${mes}.`;

  const dias =
    diasRestantes === 1
      ? "Hoy es el último día para hacerlo con total libertad."
      : `Te quedan ${diasRestantes} días para acomodarlos sin que quede registro.`;

  return {
    kind: "ventana_presupuesto",
    titulo: vos(voz, `Ajustá tus sobres de ${mes}`, `Ajusta tus sobres de ${mes}`),
    cuerpo: `${base} ${dias}`,
    cta: "Ir a mis sobres",
    descartar: "Ahora no",
  };
}

/** Aviso de cierre de mes (día 28 → fin), con lo que falta. */
export function copyCierre(args: { voz: Voz; mes: string; pendientes: string[] }): NudgeCopy {
  const { voz, mes, pendientes } = args;
  const lista =
    pendientes.length === 1
      ? `Te falta ${pendientes[0]}.`
      : `Te faltan ${pendientes.slice(0, -1).join(", ")} y ${pendientes[pendientes.length - 1]}.`;

  return {
    kind: "cierre_mes",
    titulo: vos(voz, `Cerrá ${mes} con todo registrado`, `Cierra ${mes} con todo registrado`),
    cuerpo: `${lista} ${vos(
      voz,
      "Cuando termines, pegá tu estado de cuenta y conciliamos el resto.",
      "Cuando termines, pega tu estado de cuenta y conciliamos el resto.",
    )}`,
    cta: "Completar el mes",
    descartar: "Después",
  };
}

/** Recordatorio diario (≥19:00 locales, nada registrado hoy). */
export function copyRegistroDiario(voz: Voz): NudgeCopy {
  return {
    kind: "registro_diario",
    titulo: "¿Algún gasto de hoy para registrar?",
    cuerpo: `Un minuto ahora te ahorra reconstruir el mes después. ${vos(
      voz,
      "Podés dictárselo al asistente o cargarlo a mano.",
      "Puedes dictárselo al asistente o cargarlo a mano.",
    )}`,
    cta: "Registrar un gasto",
    // No es "descartar": es una respuesta legítima. Quien no gastó hoy no está
    // posponiendo nada, y el botón tiene que dejarlo decirlo sin sentirse en falta.
    descartar: "Hoy no gasté",
  };
}

/**
 * UN aviso a la vez, por prioridad. Mostrar dos pop-ups juntos convierte el
 * acompañamiento en una avalancha, y el usuario cierra los dos sin leer ninguno.
 *
 * El orden no es por urgencia sino por VENTANA DE OPORTUNIDAD — cuál se pierde si no se
 * atiende hoy. La ventana de configuración expira el día 5 y no vuelve; el cierre tiene
 * varios días por delante; el recordatorio diario vuelve mañana. El que menos vida le
 * queda va primero.
 */
export function elegirNudge(disponibles: {
  ventana?: NudgeCopy | null;
  cierre?: NudgeCopy | null;
  diario?: NudgeCopy | null;
}): NudgeCopy | null {
  return disponibles.ventana ?? disponibles.cierre ?? disponibles.diario ?? null;
}
