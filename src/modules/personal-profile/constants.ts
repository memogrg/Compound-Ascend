/** Opciones del Setup Wizard (en español), extraídas de la Biblia (Módulo 1). */
import type { IconName } from "@/components/ui/icon";

export type Option = { value: string; label: string; desc?: string; icon?: IconName };

export const CURRENCIES: Option[] = [
  { value: "CRC", label: "Colón costarricense (₡)" },
  { value: "USD", label: "Dólar estadounidense ($)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "MXN", label: "Peso mexicano (MX$)" },
  { value: "COP", label: "Peso colombiano (COL$)" },
  { value: "GBP", label: "Libra esterlina (£)" },
];

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
