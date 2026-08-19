/**
 * LA MONEDA DE UN SOBRE — un sobre se muestra en la moneda en que se CONFIGURÓ, no en la de
 * visualización. Motor puro, sin IO: es la regla, escrita una sola vez.
 *
 * ── EL BUG QUE LO TRAJO ─────────────────────────────────────────────────────
 * `getSobreRemaining` devolvía `currency: real.currency` (la de VISUALIZACIÓN) con `budget` y
 * `spent` ya convertidos. Un sobre presupuestado en ₡445.000 aparecía como "$345 de $445": los
 * números eran los de la conversión, pero el usuario nunca escribió esa cifra en ningún lado.
 * No puede verificarla, no puede rehacer la cuenta, y el "de $445" contradice el ₡445.000 que
 * él mismo configuró dos pantallas antes.
 *
 * ── LA REGLA (vale para toda la app, no solo acá) ───────────────────────────
 * Lo que el usuario CONFIGURÓ o REGISTRÓ en una moneda se muestra en ESA moneda: presupuesto de
 * sobres, transacciones, metas, deudas, aportes. Solo los AGREGADOS que cruzan monedas se
 * convierten a la de visualización — y ahí se ETIQUETA, porque un total convertido es una
 * estimación con una tasa dentro, no un hecho.
 *
 * ── CUANDO EL GASTO VIENE EN OTRA MONEDA ────────────────────────────────────
 * El SOBRE manda: un gasto en $ contra un sobre en ₡ se convierte a ₡ para descontarlo. Es la
 * única forma de que `budget − spent` signifique algo. Y se DICE: `convertidasDesde` lleva las
 * monedas que hubo que traducir, para que el copy pueda decir de dónde salió parte de la cifra.
 * Nunca se mezclan dos símbolos en la misma frase.
 */

/** Una transacción de gasto tal como se registró: monto y moneda NATIVOS. */
export type GastoNativo = {
  categoryId: string | null;
  amount: number;
  currency: string;
};

/** Presupuesto del sobre en su moneda de configuración. `mixed` = tiene líneas en varias. */
export type PresupuestoNativo = {
  value: number;
  currency: string;
  mixed?: boolean;
};

export type MontosDelSobre = {
  /** La moneda en la que se muestran `budget` y `spent`. */
  currency: string;
  budget: number;
  spent: number;
  /**
   * Monedas de gasto distintas a la del sobre que hubo que convertir para descontar. Vacío =
   * todo se registró en la moneda del sobre y no hay ninguna tasa metida en las cifras.
   */
  convertidasDesde: string[];
  /**
   * El presupuesto del sobre mezcla monedas (dos líneas, una en ₡ y otra en $), así que NO hay
   * una moneda propia que mostrar: se cae a la de visualización y se etiqueta como convertido.
   * Es el único caso en que un sobre se muestra convertido, y es honesto decirlo.
   */
  presupuestoMixto: boolean;
};

/**
 * Los montos de un sobre en SU moneda.
 *
 * `convert` se inyecta (normalmente `convertCurrency` con las tasas del día) para que este
 * motor no arrastre la capa de FX y se pueda probar con una tabla fija.
 */
export function montosDelSobre(args: {
  categoryId: string;
  /** Presupuesto nativo del sobre; `undefined` = el sobre no tiene presupuesto este mes. */
  nativo: PresupuestoNativo | undefined;
  /** Presupuesto ya convertido a la moneda de visualización (fallback del caso mixto). */
  budgetEnVisualizacion: number;
  displayCurrency: string;
  /** Gastos del periodo, en su moneda nativa. Se filtran por `categoryId` acá. */
  gastos: GastoNativo[];
  convert: (amount: number, from: string, to: string) => number;
}): MontosDelSobre {
  const { nativo, displayCurrency, categoryId } = args;
  // Un presupuesto mixto no tiene "moneda propia": sumar ₡ con $ y ponerle un símbolo sería
  // inventar. Ahí sí manda la de visualización, y el flag hace que el copy lo aclare.
  const presupuestoMixto = !!nativo?.mixed;
  const currency = nativo && !presupuestoMixto ? nativo.currency : displayCurrency;
  const budget = nativo ? (presupuestoMixto ? args.budgetEnVisualizacion : nativo.value) : 0;

  let spent = 0;
  const convertidas = new Set<string>();
  for (const g of args.gastos) {
    if (g.categoryId !== categoryId) continue;
    if (g.currency === currency) {
      spent += g.amount;
      continue;
    }
    // El sobre manda: el gasto se traduce a la moneda del sobre para poder descontarlo.
    spent += args.convert(g.amount, g.currency, currency);
    convertidas.add(g.currency);
  }

  return {
    currency,
    budget,
    spent,
    convertidasDesde: [...convertidas].sort(),
    presupuestoMixto,
  };
}

/**
 * Acumula una línea de presupuesto sobre el total NATIVO de su sobre.
 *
 * Vive acá y no dentro de la query porque es una regla, no un detalle de cómo se leen las filas:
 * cuando dos líneas del mismo sobre están en monedas distintas, la suma nativa deja de
 * significar algo y hay que decirlo (`mixed`). Antes se sumaba igual y se etiquetaba con la
 * moneda de la ÚLTIMA línea leída — ₡300.000 + $50 salía como "₡300.050".
 */
export function acumularNativo(
  prev: (PresupuestoNativo & { label: string }) | undefined,
  linea: { label: string; amount: number; currency: string },
): PresupuestoNativo & { label: string } {
  if (!prev) {
    return { label: linea.label, value: linea.amount, currency: linea.currency };
  }
  const mixed = prev.mixed || prev.currency !== linea.currency;
  return {
    label: prev.label,
    value: prev.value + linea.amount,
    // Se conserva la PRIMERA moneda vista: en el caso mixto da igual (nadie debe mostrar esa
    // cifra), y en el normal es la única que hay.
    currency: prev.currency,
    ...(mixed ? { mixed: true } : {}),
  };
}
