/** Opciones del Módulo 2 (en español). */
import type { Option } from "@/modules/personal-profile/constants";

/**
 * Tope de filas que `listTransactions` trae por período (paginación mínima):
 * evita un fetch sin límite cuando hay muchos movimientos. La UI avisa cuando
 * se alcanza el tope (muestra los más recientes del período).
 */
export const TRANSACTIONS_LIST_CAP = 500;

export const FREQUENCIES: Option[] = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
  { value: "bimensual", label: "Cada 2 meses" },
  { value: "trimestral", label: "Trimestral" },
  { value: "cuatrimestral", label: "Cuatrimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
  { value: "unico", label: "Único" },
  { value: "variable", label: "Variable" },
];

export const INCOME_TYPES: Option[] = [
  { value: "activo", label: "Activo", desc: "Requiere tu trabajo o participación" },
  { value: "pasivo", label: "Pasivo", desc: "Proviene de activos que generan dinero" },
  { value: "extraordinario", label: "Extraordinario", desc: "Ocasional o no recurrente" },
];

export const INCOME_CATEGORIES: Option[] = [
  { value: "salario", label: "Salario" },
  { value: "bonos", label: "Bonos y beneficios" },
  { value: "comisiones", label: "Comisiones" },
  { value: "servicios", label: "Servicios profesionales" },
  { value: "negocio", label: "Negocio o ventas" },
  { value: "plataformas", label: "Plataformas digitales" },
  { value: "freelance", label: "Freelance" },
  { value: "inversiones", label: "Inversiones" },
  { value: "dividendos", label: "Dividendos" },
  { value: "alquileres", label: "Alquileres" },
  { value: "regalias", label: "Regalías" },
  { value: "venta_activos", label: "Venta de activos" },
  { value: "premios", label: "Premios o ayudas" },
  { value: "reembolsos", label: "Reembolsos" },
  { value: "otro", label: "Otro" },
];

export const EXPENSE_NATURES: Option[] = [
  { value: "esencial", label: "Esencial" },
  { value: "estilo_vida", label: "Estilo de vida" },
  { value: "financiero", label: "Financiero (deudas)" },
  { value: "proteccion", label: "Protección" },
  { value: "crecimiento", label: "Crecimiento" },
  { value: "ahorro", label: "Ahorro planificado" },
  { value: "inversion", label: "Inversión" },
  { value: "donacion", label: "Donación" },
  { value: "miscelaneo", label: "Misceláneo" },
];

export const EXPENSE_CATEGORIES: Option[] = [
  { value: "vivienda", label: "Vivienda" },
  { value: "alimentacion", label: "Alimentación" },
  { value: "servicios_hogar", label: "Servicios y hogar" },
  { value: "transporte", label: "Transporte" },
  { value: "automovil", label: "Automóvil" },
  { value: "salud", label: "Salud" },
  { value: "cuidado_personal", label: "Cuidado personal" },
  { value: "familia", label: "Familia y dependientes" },
  { value: "mascotas", label: "Mascotas" },
  { value: "educacion", label: "Educación" },
  { value: "disfrute", label: "Disfrute" },
  { value: "viajes", label: "Viajes" },
  { value: "tecnologia", label: "Tecnología" },
  { value: "suscripciones", label: "Suscripciones" },
  { value: "seguros", label: "Seguros" },
  { value: "impuestos", label: "Impuestos y trámites" },
  { value: "deudas", label: "Deudas" },
  { value: "fondo_emergencia", label: "Fondo de emergencia" },
  { value: "fondo_paz", label: "Fondo de paz" },
  { value: "inversiones", label: "Inversiones" },
  { value: "retiro", label: "Retiro" },
  { value: "donaciones", label: "Donaciones" },
  { value: "miscelaneos", label: "Misceláneos" },
];

/** Naturaleza por defecto sugerida por categoría (acelera la captura). */
export const CATEGORY_DEFAULT_NATURE: Record<string, string> = {
  vivienda: "esencial",
  alimentacion: "esencial",
  servicios_hogar: "esencial",
  transporte: "esencial",
  automovil: "esencial",
  salud: "proteccion",
  cuidado_personal: "estilo_vida",
  familia: "esencial",
  mascotas: "estilo_vida",
  educacion: "crecimiento",
  disfrute: "estilo_vida",
  viajes: "ahorro",
  tecnologia: "ahorro",
  suscripciones: "estilo_vida",
  seguros: "proteccion",
  impuestos: "financiero",
  deudas: "financiero",
  fondo_emergencia: "ahorro",
  fondo_paz: "proteccion",
  inversiones: "inversion",
  retiro: "inversion",
  donaciones: "donacion",
  miscelaneos: "miscelaneo",
};

/** Color por naturaleza (tokens del design system) para gráficos. */
/**
 * Un color por BLOQUE de la taxonomía de gasto. Es una paleta categórica: su trabajo es que
 * nueve bloques se distingan entre sí, y eso se mide (`tests/unit/contraste-paleta.test.ts`).
 *
 * La versión anterior apuntaba a tokens SEMÁNTICOS (`--c-expense`, `--warn`, `--c-invest`…)
 * y tenía tres colisiones exactas que nadie veía porque son alias encadenados: `--c-expense`
 * y `--warn` desembocan los dos en `--s2`, `--c-invest` en `--info` igual que `crecimiento`,
 * y `--teal` en `--s6` igual que `ahorro`. Leyendo esta lista los nueve valores parecen
 * distintos; resueltos, eran seis — y la dona del panel pintaba dos bloques del mismo ocre.
 *
 * Ahora apunta a la paleta de GRÁFICOS, que ya está validada para daltonismo, más dos tonos
 * nuevos (`--s7` oliva y `--s8` vino) buscados para completar los nueve sin bajar de ΔE 8 en
 * ninguna de las cuatro visiones. El orden es el canónico de `EXPENSE_NATURES`.
 */
export const NATURE_COLOR: Record<string, string> = {
  esencial: "var(--chart-3)",
  estilo_vida: "var(--s7)",
  financiero: "var(--chart-5)",
  proteccion: "var(--chart-1)",
  crecimiento: "var(--chart-2)",
  ahorro: "var(--chart-6)",
  inversion: "var(--chart-4)",
  donacion: "var(--s8)",
  miscelaneo: "var(--muted-2)",
};
