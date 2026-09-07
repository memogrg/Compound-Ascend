/**
 * Lectura de riesgo de una NOTA ESTRUCTURADA — motor puro.
 *
 * Una nota mezcla tres cosas que el usuario suele confundir: cuánto capital está
 * protegido, a partir de qué caída deja de estarlo (la barrera), y si el emisor
 * puede cancelarla antes (autocall). Este motor las traduce a frases claras.
 *
 * ES INFORMATIVO, NO UN CONSEJO. Describe los términos que el propio usuario
 * cargó; no evalúa si la nota es buena ni proyecta escenarios de mercado. La
 * frase del riesgo de crédito del emisor va SIEMPRE que haya emisor: es el
 * riesgo que más se pasa por alto en estos productos —la protección vale lo que
 * vale la solvencia de quien la promete— y no depende de ningún término.
 */

export type TerminosNota = {
  emisor?: string | null;
  subyacente?: string | null;
  /** % del capital protegido al vencimiento (100 = garantizado). */
  proteccionPct?: number | null;
  /** % del nivel inicial por debajo del cual el capital queda expuesto. */
  barreraPct?: number | null;
  autocall?: boolean;
  autocallDate?: string | null;
  /** % de participación en la subida del subyacente. */
  participacionPct?: number | null;
  vencimiento?: string | null;
};

export type LecturaRiesgo = {
  /** Frases en orden de importancia. Vacío si no hay términos cargados. */
  puntos: string[];
  /** Semáforo grueso del capital, para el color del bloque. */
  nivel: "protegido" | "condicionado" | "expuesto" | "desconocido";
};

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

export function lecturaDeRiesgo(t: TerminosNota): LecturaRiesgo {
  const puntos: string[] = [];
  let nivel: LecturaRiesgo["nivel"] = "desconocido";

  const proteccion = numero(t.proteccionPct);
  const barrera = numero(t.barreraPct);

  // 1) El capital: es lo primero que la persona quiere saber.
  //
  // LA BARRERA MANDA sobre el % de protección. Una nota que dice "100% protegido"
  // PERO tiene barrera está protegida *condicionalmente*: si el subyacente la
  // rompe, la protección desaparece. Anunciarla como protegida a secas sería
  // exactamente el malentendido que hace que la gente compre estas notas sin
  // saber qué firmó.
  if (barrera == null && proteccion != null && proteccion >= 100) {
    nivel = "protegido";
    puntos.push("Capital protegido al 100% al vencimiento, según los términos de la nota.");
  } else if (barrera != null) {
    nivel = "condicionado";
    puntos.push(
      `Barrera al ${pct(barrera)}: si ${t.subyacente ?? "el subyacente"} cae más que eso, ` +
        `tu capital queda expuesto a la caída.`,
    );
    if (proteccion != null && proteccion > 0) {
      puntos.push(`Por encima de la barrera, tenés ${pct(proteccion)} del capital protegido.`);
    }
  } else if (proteccion != null && proteccion > 0) {
    nivel = "condicionado";
    puntos.push(`Capital protegido al ${pct(proteccion)} al vencimiento.`);
  } else if (proteccion === 0) {
    nivel = "expuesto";
    puntos.push("Sin protección de capital: podés perder parte o todo lo invertido.");
  }

  // 2) Participación: la otra mitad del trato.
  const participacion = numero(t.participacionPct);
  if (participacion != null) {
    puntos.push(
      participacion >= 100
        ? `Participás del ${pct(participacion)} de la subida de ${t.subyacente ?? "el subyacente"}.`
        : `Participás sólo del ${pct(participacion)} de la subida de ${t.subyacente ?? "el subyacente"}.`,
    );
  }

  // 3) Autocall: cambia el horizonte real de la inversión.
  if (t.autocall) {
    puntos.push(
      t.autocallDate
        ? `Tiene autocall: el emisor puede cancelarla anticipadamente; la próxima observación es el ${fecha(t.autocallDate)}.`
        : "Tiene autocall: el emisor puede cancelarla anticipadamente, así que el plazo real puede ser menor.",
    );
  }

  // 4) Riesgo de crédito. SIEMPRE que haya emisor: la protección vale lo que
  //    vale quien la promete, y es lo que más se pasa por alto.
  if (t.emisor) {
    puntos.push(
      `Todo lo anterior depende de que ${t.emisor} pueda pagar: es riesgo de crédito del emisor, no del subyacente.`,
    );
  }

  return { puntos, nivel };
}

function numero(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function fecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
