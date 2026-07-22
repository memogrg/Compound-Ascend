/** Opciones del Setup Wizard (en español), extraídas de la Biblia (Módulo 1). */
import type { IconName } from "@/components/ui/icon";
import type { RiskClass } from "@/modules/personal-profile/types";
import { CURRENCY_OPTIONS } from "@/lib/format";

export type Option = { value: string; label: string; desc?: string; icon?: IconName };

/** Nombre largo por moneda (la lista de códigos/símbolos vive en @/lib/format). */
const CURRENCY_NAMES: Record<string, string> = {
  CRC: "Colón costarricense",
  USD: "Dólar estadounidense",
  EUR: "Euro",
  MXN: "Peso mexicano",
  COP: "Peso colombiano",
  GBP: "Libra esterlina",
};

export const CURRENCIES: Option[] = CURRENCY_OPTIONS.map(({ code, symbol }) => ({
  value: code,
  label: `${CURRENCY_NAMES[code] ?? code} (${symbol})`,
}));

/** Países de residencia (lista enfocada en LatAm + comunes). El valor es el
 *  nombre, que se guarda tal cual en personal_profiles.country. */
export const COUNTRIES: Option[] = [
  { value: "Costa Rica", label: "Costa Rica" },
  { value: "México", label: "México" },
  { value: "Colombia", label: "Colombia" },
  { value: "Panamá", label: "Panamá" },
  { value: "Guatemala", label: "Guatemala" },
  { value: "El Salvador", label: "El Salvador" },
  { value: "Honduras", label: "Honduras" },
  { value: "Nicaragua", label: "Nicaragua" },
  { value: "República Dominicana", label: "República Dominicana" },
  { value: "Argentina", label: "Argentina" },
  { value: "Chile", label: "Chile" },
  { value: "Perú", label: "Perú" },
  { value: "Ecuador", label: "Ecuador" },
  { value: "Uruguay", label: "Uruguay" },
  { value: "Paraguay", label: "Paraguay" },
  { value: "Bolivia", label: "Bolivia" },
  { value: "Venezuela", label: "Venezuela" },
  { value: "España", label: "España" },
  { value: "Estados Unidos", label: "Estados Unidos" },
  { value: "Canadá", label: "Canadá" },
  { value: "Otro", label: "Otro" },
];

/** Núcleo financiero: solo Personal o Familia (las demás opciones se eliminaron
 *  por revisión de producto). Con "familia" se invita hasta a 4 miembros. */
export const NUCLEUS: Option[] = [
  {
    value: "solo",
    label: "Personal",
    desc: "Gestiono mis finanzas por mi cuenta",
    icon: "profile",
  },
  {
    value: "familia",
    label: "Con familia",
    desc: "Decisiones familiares compartidas (hasta 4 miembros)",
    icon: "profile",
  },
];

export const LIFE_STAGES: Option[] = [
  { value: "ordenar", label: "Estoy tratando de ordenar mis finanzas" },
  { value: "vivir_al_dia", label: "Vivo al día y quiero dejar de sentir presión" },
  { value: "salir_deudas", label: "Tengo deudas y quiero salir de ellas" },
  { value: "ahorrar_mejor", label: "Tengo estabilidad, pero quiero ahorrar mejor" },
  { value: "empezar_invertir", label: "Ya ahorro, pero quiero empezar a invertir" },
  { value: "hacer_crecer", label: "Ya invierto y quiero hacer crecer mi patrimonio" },
  { value: "proteger_familia", label: "Quiero proteger mejor a mi familia y patrimonio" },
  { value: "libertad_financiera", label: "Quiero alcanzar libertad financiera" },
  { value: "prepararme_retiro", label: "Quiero prepararme para retirarme con tranquilidad" },
  { value: "emprender", label: "Quiero emprender o crear nuevas fuentes de ingreso" },
];

export const CONCERNS: Option[] = [
  { value: "fin_de_mes", label: "No llegar a fin de mes" },
  { value: "deudas", label: "Tener muchas deudas" },
  { value: "no_ahorro", label: "No ahorrar" },
  { value: "no_invertir", label: "No saber invertir" },
  { value: "sin_emergencia", label: "No tener fondo de emergencia" },
  { value: "sin_proteccion", label: "No tener protección familiar" },
  { value: "sin_casa", label: "No tener casa propia" },
  { value: "retiro", label: "No saber si podré retirarme" },
  { value: "claridad", label: "No tener claridad financiera" },
];

export const GOALS: Option[] = [
  { value: "ordenar", label: "Ordenar mis finanzas" },
  { value: "presupuesto", label: "Crear un presupuesto" },
  { value: "salir_deudas", label: "Salir de deudas" },
  { value: "fondo_emergencia", label: "Crear fondo de emergencia" },
  { value: "casa", label: "Comprar casa" },
  { value: "carro", label: "Comprar carro" },
  { value: "viajar", label: "Viajar" },
  { value: "estudios", label: "Estudios" },
  { value: "invertir", label: "Invertir" },
  { value: "patrimonio", label: "Crear patrimonio" },
  { value: "proteger_familia", label: "Proteger a mi familia" },
  { value: "retiro", label: "Preparar mi retiro" },
  { value: "libertad", label: "Alcanzar libertad financiera" },
  { value: "emprender", label: "Emprender" },
  { value: "ingresos_pasivos", label: "Generar ingresos pasivos" },
];

export const PRIORITIES: Option[] = [
  { value: "seguridad", label: "Seguridad financiera" },
  { value: "libertad_tiempo", label: "Libertad de tiempo" },
  { value: "vivienda", label: "Comprar vivienda" },
  { value: "viajar", label: "Viajar" },
  { value: "retiro_temprano", label: "Retirarme temprano" },
  { value: "familia", label: "Estabilidad para mi familia" },
  { value: "menos_estres", label: "Vivir con menos estrés" },
  { value: "patrimonio", label: "Crear patrimonio" },
  { value: "emprender", label: "Emprender" },
  { value: "experiencias", label: "Mejores experiencias" },
  { value: "tranquilidad", label: "Tener tranquilidad" },
];

export const SACRIFICES: Option[] = [
  { value: "comer_fuera", label: "Comer fuera" },
  { value: "viajes", label: "Viajes" },
  { value: "impulsivas", label: "Compras impulsivas" },
  { value: "entretenimiento", label: "Entretenimiento" },
  { value: "carro", label: "Cambiar de carro" },
  { value: "lujos", label: "Lujos personales" },
  { value: "suscripciones", label: "Suscripciones" },
  { value: "nada", label: "No estoy dispuesto a sacrificar nada" },
];

export const REVIEW_HABITS: Option[] = [
  { value: "nunca", label: "Nunca" },
  { value: "problemas", label: "Solo cuando hay problemas" },
  { value: "mensual", label: "Una vez al mes" },
  { value: "semanal", label: "Una vez por semana" },
  { value: "diario", label: "Casi a diario" },
];

export const HARDEST: Option[] = [
  { value: "ahorrar", label: "Ahorrar" },
  { value: "invertir", label: "Invertir" },
  { value: "controlar_gastos", label: "Controlar gastos" },
  { value: "pagar_deudas", label: "Pagar deudas" },
  { value: "planificar", label: "Planificar" },
  { value: "decir_no", label: "Decir que no" },
  { value: "disciplina", label: "Mantener disciplina" },
];

export const KNOWLEDGE_LEVELS: Option[] = [
  { value: "basico", label: "Básico", desc: "Apenas estoy empezando" },
  { value: "intermedio", label: "Intermedio", desc: "Entiendo conceptos generales" },
  { value: "avanzado", label: "Avanzado", desc: "Ahorro, invierto y planifico" },
  { value: "experto", label: "Experto", desc: "Gestiono patrimonio y estrategia" },
];

export const TOPICS: Option[] = [
  { value: "presupuesto", label: "Presupuesto" },
  { value: "deudas", label: "Deudas" },
  { value: "ahorro", label: "Ahorro" },
  { value: "emergencia", label: "Fondo de emergencia" },
  { value: "inversiones", label: "Inversiones" },
  { value: "interes_compuesto", label: "Interés compuesto" },
  { value: "seguros", label: "Seguros" },
  { value: "impuestos", label: "Impuestos" },
  { value: "retiro", label: "Retiro" },
  { value: "bienes_raices", label: "Bienes raíces" },
  { value: "cripto", label: "Criptomonedas" },
];

export const LOSS_REACTIONS: Option[] = [
  { value: "vendo", label: "Vendo de inmediato, me asusto" },
  { value: "espero", label: "Me preocupa, pero espero" },
  { value: "mantengo", label: "Mantengo, sé que puede pasar" },
  { value: "invierto_mas", label: "Aprovecho para invertir más" },
  { value: "no_se", label: "No sé qué haría" },
];

export const RISK_PREFERENCES: Option[] = [
  { value: "seguridad", label: "Seguridad, aunque gane menos" },
  { value: "equilibrio", label: "Equilibrio entre seguridad y crecimiento" },
  { value: "crecimiento", label: "Crecimiento, aunque haya más riesgo" },
];

export const INVEST_HORIZONS: Option[] = [
  { value: "menos_1", label: "Menos de 1 año" },
  { value: "1_3", label: "1 a 3 años" },
  { value: "3_5", label: "3 a 5 años" },
  { value: "mas_5", label: "Más de 5 años" },
  { value: "mas_10", label: "Más de 10 años" },
  { value: "no_se", label: "No lo sé" },
];

export const INSURANCES: Option[] = [
  { value: "vida", label: "Seguro de vida" },
  { value: "medico", label: "Seguro médico" },
  { value: "incapacidad", label: "Seguro de incapacidad" },
  { value: "vivienda", label: "Seguro de vivienda" },
  { value: "vehiculo", label: "Seguro de vehículo" },
  { value: "ninguno", label: "Ninguno" },
];

export const COACHING_TONES: Option[] = [
  { value: "directo", label: "Directo y exigente" },
  { value: "suave", label: "Suave y motivador" },
  { value: "tecnico", label: "Técnico y detallado" },
  { value: "simple", label: "Simple y paso a paso" },
  { value: "coach", label: "Como coach financiero" },
];

export const COACHING_FREQUENCIES: Option[] = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
  { value: "eventos", label: "Solo cuando algo importante pase" },
];

export const ALERT_INTENSITIES: Option[] = [
  { value: "suaves", label: "Suaves" },
  { value: "normales", label: "Normales" },
  { value: "firmes", label: "Firmes" },
  { value: "directas", label: "Muy directas" },
];

export const RICH_LIFE_PHRASES: Option[] = [
  { value: "tranquilidad", label: "Quiero tranquilidad" },
  { value: "libertad", label: "Quiero libertad" },
  { value: "seguridad_familia", label: "Seguridad para mi familia" },
  { value: "patrimonio", label: "Construir patrimonio" },
  { value: "experiencias", label: "Vivir experiencias" },
  { value: "retiro_temprano", label: "Retirarme temprano" },
  { value: "sin_preocupacion", label: "Dejar de preocuparme por dinero" },
  { value: "opciones", label: "Tener opciones" },
];

// ── Paso 6 · Psicología del dinero (Fase 3a) ──

export const INCOME_REACTIONS: Option[] = [
  { value: "distribuyo", label: "Lo distribuyo o planifico rápido." },
  { value: "pago_urgente", label: "Pago lo urgente y después veo." },
  { value: "gasto_mas", label: "Me relajo y gasto un poco más." },
  { value: "guardo", label: "Prefiero guardarlo porque me da seguridad." },
  { value: "invierto", label: "Pienso en invertirlo o hacerlo crecer." },
  { value: "no_se", label: "No tengo claro a dónde se va." },
  { value: "familia", label: "Lo uso para resolver pendientes familiares." },
];

export const STRESS_SPENDING: Option[] = [
  { value: "gusto", label: "Me doy un gusto para compensar." },
  { value: "controlo", label: "Me controlo, pero me cuesta." },
  { value: "no_gasto_ansiedad", label: "No gasto porque me da ansiedad." },
  { value: "reviso_metas", label: "Reviso mis metas antes de decidir." },
  { value: "automatico", label: "Gasto en automático sin darme cuenta." },
  { value: "ahorro", label: "Prefiero ahorrar para sentirme tranquilo." },
  { value: "animo", label: "Depende mucho de mi estado de ánimo." },
];

export const UNPLANNED_PURCHASE: Option[] = [
  { value: "compro", label: "Lo compro si puedo." },
  { value: "pienso", label: "Lo pienso y decido después." },
  { value: "reviso_presupuesto", label: "Reviso si cabe en mi presupuesto." },
  { value: "evito", label: "Lo evito casi siempre." },
  { value: "depende_dia", label: "Depende de cómo me sienta ese día." },
  { value: "compro_acomodo", label: "Lo compro y luego veo cómo me acomodo." },
  { value: "merezco", label: "Me cuesta decir que no si siento que lo merezco." },
];

export const SOCIAL_COMPARISON: Option[] = [
  { value: "motiva", label: "Me motiva." },
  { value: "presiona", label: "Me presiona." },
  { value: "atrasado", label: "Me hace sentir atrasado." },
  { value: "gastar_mas", label: "Me dan ganas de gastar más." },
  { value: "igual", label: "Me da igual." },
  { value: "mis_metas", label: "Me ayuda a pensar en mis propias metas." },
  { value: "cuestiono", label: "Me hace cuestionar si estoy haciendo suficiente." },
];

export const MONEY_SCRIPT_PHRASES: Option[] = [
  { value: "no_se_donde", label: "Nunca sé exactamente a dónde se va." },
  { value: "controlo_todo", label: "Si no controlo todo, algo puede salir mal." },
  { value: "merezco_disfrutar", label: "Trabajo duro, también merezco disfrutar." },
  { value: "mas_seguridad", label: "Necesito más seguridad antes de avanzar." },
  { value: "construya_futuro", label: "Quiero que mi dinero construya futuro." },
  { value: "incomoda_hablar", label: "Me incomoda hablar de dinero." },
  { value: "voy_tarde", label: "Siento que voy tarde." },
  { value: "aprender", label: "Quiero aprender, pero no sé por dónde empezar." },
  { value: "familia_depende", label: "Mi familia depende de que yo tome buenas decisiones." },
  { value: "realmente_bien", label: "No quiero parecer exitoso; quiero estar realmente bien." },
];

// ── Pasos 3 y 5 · Emoción directa y narrativa de valor (Fase 3b) ──

export const DOMINANT_EMOTIONS: Option[] = [
  { value: "tranquilidad", label: "Tranquilidad" },
  { value: "motivacion", label: "Motivación" },
  { value: "confusion", label: "Confusión" },
  { value: "presion", label: "Presión" },
  { value: "culpa", label: "Culpa" },
  { value: "miedo", label: "Miedo" },
  { value: "frustracion", label: "Frustración" },
  { value: "evito", label: "Evito pensarlo" },
];

export const SINGLE_PROBLEMS: Option[] = [
  { value: "ordenar_gastos", label: "Ordenar mis gastos." },
  { value: "crear_presupuesto", label: "Crear un presupuesto." },
  { value: "salir_deuda", label: "Salir de una deuda." },
  { value: "ahorrar_algo", label: "Ahorrar algo, aunque sea poco." },
  { value: "construir_fondo", label: "Construir mi fondo de emergencia." },
  { value: "empezar_invertir", label: "Empezar a invertir." },
  { value: "proteger_familia", label: "Proteger a mi familia." },
  { value: "entender", label: "Entender mi situación real." },
  { value: "dejar_estres", label: "Dejar de sentir estrés financiero." },
];

export const DINERO_PRIMERO: Option[] = [
  { value: "tranquilidad", label: "Tranquilidad." },
  { value: "libertad", label: "Libertad." },
  { value: "seguridad_familia", label: "Seguridad para mi familia." },
  { value: "crecimiento", label: "Crecimiento patrimonial." },
  { value: "experiencias", label: "Más experiencias." },
  { value: "menos_deudas", label: "Menos deudas." },
  { value: "control", label: "Más control." },
  { value: "opciones", label: "Más opciones." },
  { value: "menos_estres", label: "Menos estrés." },
];

export const CONECTA_FRASES: Option[] = [
  { value: "dormir_tranquilo", label: "Quiero dormir tranquilo." },
  { value: "no_voy_tarde", label: "Quiero dejar de sentir que voy tarde." },
  { value: "disfrutar_sin_desorden", label: "Quiero disfrutar más sin desordenarme." },
  { value: "dinero_trabaje", label: "Quiero que mi dinero trabaje por mí." },
  { value: "proteger", label: "Quiero proteger a quienes amo." },
  { value: "mas_opciones", label: "Quiero construir una vida con más opciones." },
  { value: "por_fin_control", label: "Quiero sentir que por fin tengo control." },
  { value: "avanzar_simple", label: "Quiero avanzar sin complicarme tanto." },
];

// ── Pasos 7/9/10/11 · Personalización (Fase 3c) ──

export const EXPLAIN_STYLES: Option[] = [
  { value: "muy_simple", label: "Muy simple, paso a paso." },
  { value: "ejemplos", label: "Con ejemplos cotidianos." },
  { value: "numeros", label: "Con números y escenarios." },
  { value: "tecnico", label: "Con explicación técnica." },
  { value: "directo", label: "Directo al punto." },
  { value: "resumen_detalle", label: "Primero resumen y luego detalle si quiero profundizar." },
];

export const DECISION_COMFORT: Option[] = [
  { value: "perdido", label: "Me siento perdido." },
  { value: "cuesta", label: "Me cuesta bastante." },
  { value: "algunas", label: "Algunas decisiones sí, otras no." },
  { value: "comodo", label: "Me siento bastante cómodo." },
  { value: "seguro", label: "Me siento seguro tomando decisiones." },
];

export const INCOME_STOP_COVERAGE: Option[] = [
  { value: "menos_1_mes", label: "Menos de 1 mes." },
  { value: "1_2_meses", label: "1 a 2 meses." },
  { value: "3_5_meses", label: "3 a 5 meses." },
  { value: "6_12_meses", label: "6 a 12 meses." },
  { value: "mas_12_meses", label: "Más de 12 meses." },
  { value: "no_se", label: "No lo sé." },
];

export const PROTECTION_PERCEIVED: Option[] = [
  { value: "muy_expuesto", label: "Muy expuesto." },
  { value: "algo_expuesto", label: "Algo expuesto." },
  { value: "mas_o_menos", label: "Más o menos protegido." },
  { value: "bastante", label: "Bastante protegido." },
  { value: "muy_protegido", label: "Muy protegido." },
];

export const ALERT_STYLES: Option[] = [
  { value: "suavidad", label: "Que me avise con suavidad." },
  { value: "directo", label: "Que me lo diga claro y directo." },
  { value: "numeros", label: "Que me explique el impacto en números." },
  { value: "opciones", label: "Que me dé opciones para decidir." },
  { value: "que_hacer", label: "Que me diga qué hacer primero." },
  { value: "meta", label: "Que me lo conecte con mi meta principal." },
  { value: "solo_importante", label: "Que solo me avise si es realmente importante." },
];

export const INTERVENTION_STYLES: Option[] = [
  { value: "recordatorio", label: "Un recordatorio amable." },
  { value: "impacto_futuro", label: "Ver el impacto futuro." },
  { value: "alerta_antes", label: "Una alerta antes de gastar." },
  { value: "alternativa", label: "Una alternativa más barata." },
  { value: "reto", label: "Un reto pequeño para corregir." },
  { value: "directo", label: "Un mensaje directo." },
  { value: "porque", label: "Que me recuerden mi porqué." },
];

export const FUTURE_IMAGES: Option[] = [
  { value: "casa_estabilidad", label: "Casa y estabilidad." },
  { value: "viajes", label: "Viajes y experiencias." },
  { value: "familia_protegida", label: "Familia protegida." },
  { value: "libertad_tiempo", label: "Libertad de tiempo." },
  { value: "patrimonio", label: "Patrimonio creciendo." },
  { value: "retiro", label: "Retiro tranquilo." },
  { value: "negocio", label: "Negocio propio." },
  { value: "vida_simple", label: "Vida simple y sin estrés." },
  { value: "ingresos_pasivos", label: "Ingresos pasivos." },
  { value: "opciones", label: "Opciones y flexibilidad." },
];

export const DESIRED_FEELINGS: Option[] = [
  { value: "claridad", label: "Claridad." },
  { value: "tranquilidad", label: "Tranquilidad." },
  { value: "motivacion", label: "Motivación." },
  { value: "control", label: "Control." },
  { value: "seguridad", label: "Seguridad." },
  { value: "progreso", label: "Progreso." },
  { value: "libertad", label: "Libertad." },
  { value: "confianza", label: "Confianza." },
];

// ── Presentación del perfil de riesgo (cierre v2 + tab) ──

export const RISK_DISPLAY: Record<RiskClass, string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  balanceado: "Balanceado",
  crecimiento: "Crecimiento",
  agresivo: "Crecimiento alto",
};

/** Una frase positiva por clase de riesgo (segunda persona). */
export const RISK_READING: Record<RiskClass, string> = {
  conservador:
    "Priorizas la seguridad y la estabilidad; te sientes mejor con riesgos acotados y previsibles.",
  moderado: "Buscas equilibrio entre seguridad y crecimiento, sin sobresaltos.",
  balanceado: "Equilibras crecimiento y protección según el momento, con flexibilidad.",
  crecimiento:
    "Estás dispuesto a asumir algo de volatilidad por un mayor crecimiento a largo plazo.",
  agresivo:
    "Toleras la volatilidad y piensas a largo plazo; puedes ser ambicioso si tu base está lista.",
};

/** "Qué sí te permite" tu perfil de riesgo (segunda persona). */
export const RISK_ALLOWS: Record<RiskClass, string> = {
  conservador:
    "preservar tu capital y dormir tranquilo, con instrumentos estables y líquidos.",
  moderado: "una mezcla equilibrada entre seguridad y crecimiento.",
  balanceado: "combinar protección y crecimiento con criterio.",
  crecimiento: "estrategias orientadas a crecimiento, con horizonte y un plan claro.",
  agresivo: "ser ambicioso con activos de mayor crecimiento, siempre que tu base esté lista.",
};

/** "Qué cuidar" según tu perfil de riesgo. */
export const RISK_GUARD: Record<RiskClass, string[]> = {
  conservador: ["No quedarte solo en liquidez y perder crecimiento de largo plazo."],
  moderado: ["Definir qué parte proteges y qué parte haces crecer."],
  balanceado: ["Rebalancear cuando una parte crezca de más."],
  crecimiento: [
    "No confundir tolerancia al riesgo con falta de estrategia.",
    "No concentrar todo en una sola apuesta.",
    "No invertir dinero que puedas necesitar pronto.",
    "No decidir por FOMO ni euforia.",
  ],
  agresivo: [
    "No confundir tolerancia al riesgo con falta de estrategia.",
    "No concentrar todo en una sola apuesta.",
    "No invertir dinero que puedas necesitar pronto.",
    "No decidir por FOMO ni euforia.",
  ],
};
