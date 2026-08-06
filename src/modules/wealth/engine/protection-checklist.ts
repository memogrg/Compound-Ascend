/**
 * Checklist de PROTECCIONES BASE (piloto Inicio · Delta 1) — motor puro.
 *
 * La ficha de Protección pide una cuadrícula de 5 protecciones base con ✓/✗:
 * auto, vida, médico, fondo de emergencia, fondo de paz. Los tres primeros salen
 * de pólizas (PolicyType); los dos fondos, de las metas de defensa (flags del
 * WealthContext / fund-sizing). Esta es la LISTA CANÓNICA de referencia — antes no
 * existía; aquí se define y se mapea, sin tocar el modelo.
 *
 * OJO: el "contador de activaciones" NO se modela aquí (no hay datos) — es un
 * pendiente separado, fuera del piloto.
 */
import type { PolicyType } from "@/modules/wealth/types";

export type ProtectionKey = "auto" | "vida" | "medico" | "fondo_emergencia" | "fondo_paz";

export type ProtectionChecklistItem = {
  key: ProtectionKey;
  label: string;
  /** Cubierta: hay póliza con cobertura > 0, o el fondo está registrado. */
  covered: boolean;
  /** Cobertura de la(s) póliza(s), sólo para los ítems respaldados por pólizas. */
  coverage: number | null;
};

/** Lista canónica: los 3 ítems de póliza y los PolicyType que cuentan para cada uno. */
const POLICY_BASE: {
  key: Extract<ProtectionKey, "auto" | "vida" | "medico">;
  label: string;
  types: PolicyType[];
}[] = [
  { key: "auto", label: "Auto", types: ["vehiculo"] },
  { key: "vida", label: "Vida", types: ["vida"] },
  // "Médico" agrupa la familia de salud.
  { key: "medico", label: "Médico", types: ["medico", "gastos_mayores", "gastos_menores"] },
];

export type ProtectionChecklistInput = {
  /** De ProtectionDiagnosis.coverageByType. */
  coverageByType: { type: PolicyType; coverage: number }[];
  /** De WealthContext / fund-sizing. */
  hasEmergencyFund: boolean;
  hasPeaceFund: boolean;
};

export function buildBaseProtectionChecklist(
  input: ProtectionChecklistInput,
): ProtectionChecklistItem[] {
  const coverageOf = (types: PolicyType[]): number =>
    input.coverageByType
      .filter((c) => types.includes(c.type))
      .reduce((s, c) => s + (c.coverage > 0 ? c.coverage : 0), 0);

  const policyItems: ProtectionChecklistItem[] = POLICY_BASE.map(({ key, label, types }) => {
    const coverage = coverageOf(types);
    return { key, label, covered: coverage > 0, coverage };
  });

  return [
    ...policyItems,
    {
      key: "fondo_emergencia",
      label: "Fondo de emergencia",
      covered: input.hasEmergencyFund,
      coverage: null,
    },
    { key: "fondo_paz", label: "Fondo de paz", covered: input.hasPeaceFund, coverage: null },
  ];
}
