/**
 * Qué ofrece la paleta de comandos. Puro: sin React, sin IO.
 *
 * Los destinos NO se escriben acá: se derivan de `nav-v2.ts`, que ya es la fuente única de
 * la navegación. Si mañana una pestaña cambia de ruta, la paleta la sigue sola — y el test
 * comprueba que ninguna ruta web del modelo se quede fuera.
 */
import { CONFIGURACION, NUCLEOS, type Pestana } from "@/lib/constants/nav-v2";
import type { IconName } from "@/components/ui/icon";

export type ItemPaleta = {
  id: string;
  grupo: string;
  etiqueta: string;
  ruta: string;
  icono?: IconName;
  /** Sinónimos en español para el filtro: lo que la persona escribiría, no el nombre oficial. */
  palabras: string[];
};

/**
 * La paleta vive en el shell WEB. `rutasDelModelo()` mezcla web y móvil (38 rutas: las de
 * escritorio y sus pares `/m/…`), y ofrecer `/m/metas` desde el escritorio llevaría a la app
 * móvil sin querer. `/m` exacto y `/m/` como prefijo — `startsWith("/m")` a secas también
 * atraparía `/mi-base-financiera` y `/mis-acciones`.
 */
export function esRutaWeb(ruta: string): boolean {
  return ruta !== "/m" && !ruta.startsWith("/m/");
}

/** Sinónimos por pestaña. Solo donde el nombre oficial no es lo que la gente escribe. */
const SINONIMOS: Record<string, string[]> = {
  // Hoy
  panel: ["inicio", "resumen", "hoy"],
  acciones: ["pendientes", "tareas", "que hacer"],
  progreso: ["etapa", "avance", "racha"],
  // Flujo
  resumen: ["base", "mes", "presupuesto"],
  ingresos: ["salario", "sueldo", "entradas"],
  gastos: ["egresos", "compras", "sobres"],
  transacciones: ["movimientos", "historial", "pagos"],
  // Planes
  metas: ["ahorro", "objetivos", "meta"],
  deudas: ["prestamos", "tarjeta", "hipoteca"],
  fondos: ["emergencia", "colchon", "paz"],
  // Patrimonio
  inversiones: ["portafolio", "acciones", "cripto"],
  proteccion: ["seguros", "polizas", "defensa"],
  indicadores: ["mercado", "inflacion", "tipo de cambio"],
  // Asesor
  chat: ["asistente", "preguntar", "agente"],
  // Configuración
  "perfil-financiero": ["adn", "perfil", "cuestionario"],
  cuenta: ["plan", "facturacion", "ajustes"],
  asistentes: ["configurar", "wizard", "asistente de configuracion"],
  suscripcion: ["pago", "plan", "cobro"],
};

/**
 * Acciones rápidas. Las rutas base NO están inventadas: son las mismas que ya usan los CTA
 * de los frascos vinculados (`financial-base/engine/expense-jars.ts:248-263`), donde
 * `useDeepLinkModal` atrapa el `?new=` y abre el formulario del módulo dueño.
 *
 * «Registrar gasto» e «ingreso» apuntan a `/transacciones` sin parámetro: el alta vive en un
 * modal (`QuickAddModal`) que todavía no tiene deep-link propio. Queda anotado como backlog
 * (`?new=expense|income`); mientras tanto la paleta deja a la persona en la pantalla correcta.
 */
const ACCIONES: ItemPaleta[] = [
  {
    id: "accion-meta",
    grupo: "Acciones",
    etiqueta: "Nueva meta",
    ruta: "/control-financiero?new=goal",
    icono: "flag",
    palabras: ["objetivo", "ahorrar", "crear meta"],
  },
  {
    id: "accion-inversion",
    grupo: "Acciones",
    etiqueta: "Nueva inversión",
    ruta: "/patrimonio?new=holding",
    icono: "invest",
    palabras: ["holding", "posicion", "comprar"],
  },
  {
    id: "accion-deuda",
    grupo: "Acciones",
    etiqueta: "Nueva deuda",
    ruta: "/deudas?new=debt",
    icono: "debt",
    palabras: ["prestamo", "tarjeta", "credito"],
  },
  {
    id: "accion-poliza",
    grupo: "Acciones",
    etiqueta: "Nueva póliza",
    ruta: "/patrimonio/proteccion?new=policy",
    icono: "defense",
    palabras: ["seguro", "cobertura"],
  },
  {
    id: "accion-gasto",
    grupo: "Acciones",
    etiqueta: "Registrar gasto",
    ruta: "/transacciones",
    icono: "expense",
    palabras: ["anotar gasto", "compra", "egreso"],
  },
  {
    id: "accion-ingreso",
    grupo: "Acciones",
    etiqueta: "Registrar ingreso",
    ruta: "/transacciones",
    icono: "income",
    palabras: ["anotar ingreso", "cobro", "entrada"],
  },
];

/** Pestañas con pantalla web: las `nueva`/`futura` no tienen `href` y no son destinos. */
function navegables(tabs: readonly Pestana[]): Pestana[] {
  return tabs.filter((t) => t.status === "existente" && t.href !== null && esRutaWeb(t.href));
}

/**
 * Todos los items, en orden de definición: primero las acciones —lo que se quiere HACER— y
 * después la navegación por núcleo, en el mismo orden que el sidebar.
 */
export function construirItems(): ItemPaleta[] {
  const items: ItemPaleta[] = [...ACCIONES];

  for (const nucleo of NUCLEOS) {
    for (const t of navegables(nucleo.tabs)) {
      items.push({
        id: `${nucleo.id}-${t.id}`,
        grupo: nucleo.name,
        etiqueta: t.name,
        ruta: t.href as string,
        icono: nucleo.icon,
        palabras: SINONIMOS[t.id] ?? [],
      });
    }
  }

  for (const c of CONFIGURACION) {
    if (!c.href || !esRutaWeb(c.href)) continue;
    items.push({
      id: `config-${c.id}`,
      grupo: "Configuración",
      etiqueta: c.name,
      ruta: c.href,
      icono: "gear",
      palabras: SINONIMOS[c.id] ?? [],
    });
  }

  return items;
}
