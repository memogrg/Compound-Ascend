/**
 * Motores de Patrimonio (puros, testeables): preparación para invertir, brechas
 * de protección, balance ofensiva/defensiva y estadísticas de cartera.
 * Filosofía de la Biblia: primero proteger la base, luego acelerar el crecimiento.
 */
import type {
  Investment,
  InsurancePolicy,
  InvestmentReadiness,
  ReadinessState,
  ProtectionDiagnosis,
  ProtectionGap,
  WealthContext,
  Balance,
  PortfolioStats,
  AssetType,
} from "@/modules/wealth/types";

const READINESS_LABEL: Record<ReadinessState, string> = {
  no_listo: "No listo todavía",
  empezar_pequeno: "Listo para empezar pequeño",
  constante: "Listo para invertir constante",
  diversificar: "Listo para diversificar",
  optimizar: "Listo para optimizar",
};

/** Score de Preparación para Invertir + estado (semáforo patrimonial). */
export function computeReadiness(
  ctx: WealthContext,
  investments: Investment[],
): InvestmentReadiness {
  const checklist = [
    { label: "Flujo libre positivo", met: ctx.freeCashflow > 0 },
    { label: "Deuda cara controlada", met: !ctx.hasCriticalDebt },
    { label: "Fondo de emergencia", met: ctx.hasEmergencyFund },
    { label: "Perfil de riesgo definido", met: ctx.riskClassKnown },
    { label: "Aporte mensual sostenible", met: ctx.freeCashflow > 0 },
    { label: "Ya tienes inversiones", met: investments.length > 0 },
  ];
  const met = checklist.filter((c) => c.met).length;
  const score = Math.round((met / checklist.length) * 100);

  // Bloqueos duros: sin base, no se recomienda invertir fuerte.
  const blocked = ctx.freeCashflow <= 0 || ctx.hasCriticalDebt || !ctx.hasEmergencyFund;

  let state: ReadinessState;
  let semaforo: InvestmentReadiness["semaforo"];
  let message: string;

  if (blocked) {
    state = "no_listo";
    semaforo = "rojo";
    message =
      "Antes de acelerar crecimiento, protege tu estabilidad. Invertir sin base sería como construir un segundo piso sin revisar columnas.";
  } else if (investments.length === 0) {
    state = "empezar_pequeno";
    semaforo = "amarillo";
    message =
      "Tu base permite iniciar una estrategia gradual con montos bajos y productos simples, alineada a tu perfil.";
  } else if (score >= 85) {
    state = "optimizar";
    semaforo = "verde";
    message =
      "Puedes evaluar eficiencia de costos, rebalanceo, concentración y protección patrimonial avanzada.";
  } else if (score >= 70) {
    state = "diversificar";
    semaforo = "verde";
    message = "Ya tienes una base de inversión; revisa el balance entre clases de activo.";
  } else {
    state = "constante";
    semaforo = "verde";
    message = "Tu base permite automatizar aportes mensuales hacia objetivos de largo plazo.";
  }

  return { score, state, stateLabel: READINESS_LABEL[state], semaforo, message, checklist };
}

/**
 * Las 4 protecciones esenciales que definen estar "PROTEGIDO". Cada una pesa
 * igual en el score; con las 4 cubiertas el score llega a 100. La cobertura de
 * vida es esencial SIEMPRE (no condicional a dependientes). "gastos_menores" es
 * opcional y se maneja aparte: sugiere pero no afecta el score.
 */
type EssentialProtection = {
  type: string;
  covered: boolean;
  severity: ProtectionGap["severity"];
  description: string;
  recommendation: string;
};

/** Score de Protección Patrimonial + brechas detectadas. */
export function computeProtection(
  ctx: WealthContext,
  policies: InsurancePolicy[],
): ProtectionDiagnosis {
  const have = new Set(policies.map((p) => p.policyType));
  const gaps: ProtectionGap[] = [];

  const essentials: EssentialProtection[] = [
    {
      type: "Seguro de gastos mayores",
      covered: have.has("gastos_mayores"),
      severity: "alto",
      description:
        "Una hospitalización o cirugía puede costar años de ahorro; sin gastos mayores tu patrimonio queda expuesto.",
      recommendation:
        "Detectamos una brecha; si quieres, revisamos opciones acordes a tu presupuesto.",
    },
    {
      type: "Seguro de vida",
      covered: have.has("vida"),
      severity: "alto",
      description:
        "Si tu ingreso desapareciera, quienes dependen de ti quedarían sin respaldo económico.",
      recommendation:
        "Detectamos una brecha; si quieres, revisamos opciones acordes a tu presupuesto.",
    },
    {
      type: "Fondo de emergencia",
      covered: ctx.hasEmergencyFund,
      severity: "alto",
      description: "Sin reserva para imprevistos, un evento puede devolverte a la deuda.",
      recommendation: "Construye una reserva mínima antes de asumir más riesgo.",
    },
    {
      type: "Fondo de paz",
      covered: ctx.hasPeaceFund,
      severity: "medio",
      description:
        "El fondo de paz te da margen para decisiones difíciles sin comprometer tu estabilidad.",
      recommendation: "Aparta un fondo de paz que te dé tranquilidad ante cambios de vida.",
    },
  ];

  let covered = 0;
  const total = essentials.length;
  for (const e of essentials) {
    if (e.covered) covered += 1;
    else
      gaps.push({
        type: e.type,
        severity: e.severity,
        description: e.description,
        recommendation: e.recommendation,
      });
  }

  // Opcional: gastos médicos menores NO cuenta en el score; solo se sugiere.
  if (!have.has("gastos_menores")) {
    gaps.push({
      type: "Gastos médicos menores (opcional)",
      severity: "bajo",
      description:
        "Cubre consultas y estudios ambulatorios. Es opcional: no afecta tu puntuación de protección.",
      recommendation:
        "Si quieres reducir gastos médicos del día a día, considéralo como complemento.",
    });
  }

  const score = total > 0 ? Math.round((covered / total) * 100) : 0;

  const coverageByType = policies
    .filter((p) => (p.coverage ?? 0) > 0)
    .map((p) => ({ type: p.policyType, coverage: Number(p.coverage) }));
  const totalCoverage = coverageByType.reduce((s, c) => s + c.coverage, 0);
  const annualPremium = policies.reduce((s, p) => s + annualizePremium(p), 0);

  return {
    score,
    gaps,
    coverageByType,
    totalCoverage,
    annualPremium: Math.round(annualPremium),
    activePolicies: policies.length,
  };
}

function annualizePremium(p: InsurancePolicy): number {
  const amount = Number(p.premium ?? 0);
  switch (p.premiumFrequency) {
    case "mensual":
      return amount * 12;
    case "trimestral":
      return amount * 4;
    case "semestral":
      return amount * 2;
    default:
      return amount; // anual o sin especificar
  }
}

/** Balance ofensiva (crecimiento) vs defensiva (protección). */
export function computeBalance(
  readiness: InvestmentReadiness,
  protection: ProtectionDiagnosis,
  hasInvestments: boolean,
): Balance {
  const offense = hasInvestments
    ? Math.max(40, readiness.score)
    : Math.round(readiness.score * 0.4);
  const defense = protection.score;
  let message: string;
  if (offense - defense >= 25) {
    message =
      "Estás muy enfocado en crecer, pero tu protección está rezagada. Fortalece coberturas antes de aumentar exposición.";
  } else if (defense - offense >= 25) {
    message =
      "Tienes buena protección, pero tu patrimonio podría crecer por debajo de su potencial.";
  } else {
    message = "Tu ofensiva y tu defensiva están razonablemente balanceadas.";
  }
  return { offense, defense, message };
}

const ASSET_LABEL: Record<AssetType, string> = {
  etf: "ETFs",
  accion: "Acciones",
  bono: "Bonos",
  fondo: "Fondos",
  certificado: "Certificados",
  inmueble: "Bienes raíces",
  cripto: "Cripto",
  negocio: "Negocio",
  pension: "Pensión",
  commodity: "Commodities",
  arte: "Arte",
  nft: "NFTs",
  otro: "Otros",
};

const ASSET_COLOR: Record<string, string> = {
  ETFs: "var(--pos)",
  Acciones: "var(--info)",
  Bonos: "var(--warn)",
  Fondos: "var(--teal)",
  "Bienes raíces": "var(--c-networth)",
  Cripto: "var(--gold)",
  Negocio: "var(--c-protect)",
};

export function computePortfolio(investments: Investment[]): PortfolioStats {
  const byType = new Map<string, number>();
  let totalInvested = 0;
  let monthlyContribution = 0;
  for (const inv of investments) {
    const label = ASSET_LABEL[inv.assetType] ?? "Otros";
    byType.set(label, (byType.get(label) ?? 0) + inv.investedAmount);
    totalInvested += inv.investedAmount;
    monthlyContribution += inv.contribution;
  }
  const distribution = Array.from(byType.entries())
    .map(([label, value]) => ({ label, value, color: ASSET_COLOR[label] ?? "var(--muted-2)" }))
    .sort((a, b) => b.value - a.value);

  const topConcentration = totalInvested > 0 ? (distribution[0]?.value ?? 0) / totalInvested : 0;
  const diversification =
    distribution.length >= 4 && topConcentration < 0.5
      ? "alta"
      : distribution.length >= 2 && topConcentration < 0.7
        ? "media"
        : "baja";

  return { totalInvested, monthlyContribution, distribution, diversification, topConcentration };
}
