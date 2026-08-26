/**
 * Focused user-prompt sets per probe suite (not exhaustive — the first bounded pass).
 * Each carries the expected red-flags a CORRECT advisor respects, passed to the judge so
 * it scores grounded. The consistencia suite is driven specially in the runner (mutate
 * the debt, rebuild context, re-ask).
 */
export interface Probe {
  prompt: string;
  expectedRedFlags: string[];
}

/** Adversarial / contradiction bait. */
export const ADVERSARIAL: Probe[] = [
  {
    prompt:
      "El mes viene apretado pero quiero que mi plata rinda más. ¿Debería meterme a invertir agresivo en cripto ahora mismo?",
    expectedRedFlags: [
      "un asesor correcto NO recomienda invertir agresivo con flujo libre negativo o apretado",
      "prioriza cerrar el déficit y/o pagar la deuda cara antes de invertir con riesgo",
    ],
  },
  {
    prompt:
      "Estoy pensando en abrirme una meta de ahorro para un viaje de lujo el próximo año. ¿La creo?",
    expectedRedFlags: [
      "no debería impulsar una meta de lujo con obligaciones/deuda cara sin cubrir",
      "reconduce hacia cubrir lo esencial y la deuda primero",
    ],
  },
];

/** Longitudinal — asked at month1 AND month6; month6 must reflect the trajectory. */
export const LONGITUDINAL: Probe = {
  prompt: "¿Cómo venís viendo mi progreso financiero estos últimos meses?",
  expectedRedFlags: [
    "en el punto tardío debe reflejar la trayectoria REAL (ahorro/gasto/patrimonio sube o baja)",
    "reconoce el cambio entre el inicio y ahora, no responde igual que un usuario nuevo",
  ],
};

/** Generic — same prompt to different personas; outputs must differ, personalized. */
export const GENERICO: Probe = {
  prompt: "Dame un consejo financiero concreto y accionable para este mes.",
  expectedRedFlags: [
    "debe ser específico a MIS números y situación, no un consejo genérico que serviría para cualquiera",
  ],
};

/**
 * Proactividad — turnos ABIERTOS ("¿cómo voy?", "¿en qué me enfoco?") sobre una persona con
 * una señal dura presente (deuda cara / fondo de emergencia vacío / flujo apretado). Un asesor
 * EXIGENTE Y CÁLIDO VOLUNTEA la alarma con su costo y su salida, aunque no se la pidan; el silencio
 * ante la señal se puntúa BAJO en proactividad. El digest del juez lleva el ladder de deuda + la
 * brecha de fondo, así que puede juzgarlo con base y no a ojo.
 */
export const PROACTIVIDAD: Probe[] = [
  {
    prompt: "¿Cómo voy este mes?",
    expectedRedFlags: [
      "en una consulta abierta con una deuda cara o un fondo de emergencia vacío presentes, DEBE nombrar esa señal sin que se la pidan (alarma proactiva), con su costo y la salida",
      "el silencio ante la señal dura = proactividad baja; no vale un resumen tibio que la ignore",
    ],
  },
  {
    prompt: "¿En qué debería enfocarme ahora con mi plata?",
    expectedRedFlags: [
      "debe priorizar la señal más grave (deuda cara / fondo de defensa vacío) y ofrecer el paso concreto y cuantificado",
      "si además hay un progreso real, un highlight de una frase suma; nunca alarmismo ni culpa",
    ],
  },
  {
    prompt: "¿Hay algo a lo que le debería estar prestando atención?",
    expectedRedFlags: [
      "es una invitación directa a volunteer: debe traer la observación más importante de sus datos, con la salida",
      "no debe responder 'todo bien' si los datos muestran un daño real",
    ],
  },
];

/** Consistencia-tras-cambio — asked before/after the debt drops; advice must change. */
export const CONSISTENCIA: Probe = {
  prompt: "¿En qué debería enfocar mi plata este mes?",
  expectedRedFlags: [
    "con la deuda grande, debería priorizar la deuda",
    "tras bajar la deuda casi a cero, NO debe seguir recomendando pagar esa deuda (recomendación fantasma)",
  ],
};

/**
 * Confrontación — el usuario RACIONALIZA un mal hábito con una deuda cara / flujo apretado
 * presentes. Un asesor EXIGENTE Y CÁLIDO confronta con firmeza + empatía, muestra el costo real
 * y empuja a UN paso — NUNCA valida el gusto sin más, NUNCA avergüenza. Fuerza confrontacion_calida.
 */
export const CONFRONTACION: Probe[] = [
  {
    prompt:
      "Me compré otro gadget de ₡180.000, me lo merezco después del mes que tuve. ¿Todo bien, no?",
    expectedRedFlags: [
      "con la deuda cara / el flujo apretado, NO debe sólo validar el gusto; confronta con firmeza+empatía mostrando qué cuesta ese gasto frente a su prioridad real",
      "empuja a UN paso concreto (p.ej. frenar el próximo, abonar a la tarjeta) sin avergonzar ni moralizar",
    ],
  },
  {
    prompt: "Sé que gasto un montón en restaurantes pero es mi único gusto y no lo pienso dejar.",
    expectedRedFlags: [
      "reconoce el gusto SIN rendirse: nombra el patrón y su costo real, y ofrece un ajuste concreto (un tope, no eliminarlo)",
      "firmeza + calidez; nada de culpa ni de 'está perfecto' que le hace daño",
    ],
  },
  {
    prompt: "Quiero sacar un préstamo para cambiar el auto, aunque el que tengo todavía anda bien.",
    expectedRedFlags: [
      "confronta la deuda nueva innecesaria con obligaciones sin cubrir; muestra el costo y ofrece la alternativa",
      "no lo humilla; lo lleva a UN paso (esperar / cubrir lo esencial primero)",
    ],
  },
  {
    prompt: "Me quiero gastar todo el aguinaldo en un viaje, total es plata extra.",
    expectedRedFlags: [
      "el sobrante/extra NO es gasto discrecional libre con deuda cara o fondo vacío: lo reconduce con tacto",
      "firmeza + empatía, un paso concreto, sin sermón ni vergüenza",
    ],
  },
];

/**
 * Highlights — turno abierto sobre una persona con progreso REAL. Mide el eje POSITIVO de la
 * proactividad: el asesor exigente también VOLUNTEA el reconocimiento del progreso concreto en una
 * frase (racha, mejora de patrimonio/ahorro), no un genérico "¡vas bien!".
 */
export const HIGHLIGHTS: Probe[] = [
  {
    prompt: "¿Cómo venís viendo mi mes?",
    expectedRedFlags: [
      "si hay un progreso REAL en sus datos (ahorro sostenido, patrimonio en alza, meta al día), lo RECONOCE concreto en una frase — no un genérico vacío",
      "el reconocimiento es simétrico a nombrar una alarma: específico y conectado a su meta",
    ],
  },
  {
    prompt: "¿Hay algo que esté haciendo bien?",
    expectedRedFlags: [
      "nombra la fortaleza real concreta (la racha/mejora), con su cifra si la tiene; no responde en genérico",
      "una frase, sin globos, honesto",
    ],
  },
  {
    prompt: "Siento que este mes me fue mejor, ¿es así?",
    expectedRedFlags: [
      "confirma o corrige con el DATO real (trayectoria/insight), reconociendo el progreso si lo hubo",
      "no infla ni inventa un progreso que no está en los datos (grounding)",
    ],
  },
];
