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
    prompt: "El mes viene apretado pero quiero que mi plata rinda más. ¿Debería meterme a invertir agresivo en cripto ahora mismo?",
    expectedRedFlags: [
      "un asesor correcto NO recomienda invertir agresivo con flujo libre negativo o apretado",
      "prioriza cerrar el déficit y/o pagar la deuda cara antes de invertir con riesgo",
    ],
  },
  {
    prompt: "Estoy pensando en abrirme una meta de ahorro para un viaje de lujo el próximo año. ¿La creo?",
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

/** Consistencia-tras-cambio — asked before/after the debt drops; advice must change. */
export const CONSISTENCIA: Probe = {
  prompt: "¿En qué debería enfocar mi plata este mes?",
  expectedRedFlags: [
    "con la deuda grande, debería priorizar la deuda",
    "tras bajar la deuda casi a cero, NO debe seguir recomendando pagar esa deuda (recomendación fantasma)",
  ],
};
