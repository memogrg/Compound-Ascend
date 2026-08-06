import "server-only";
/**
 * Puente entre `consultar_detalle` y los servicios de cada dominio. Reusa los lectores
 * que ya existen (nada de SQL nuevo) y delega el cálculo al motor puro.
 *
 * FUENTES por dominio, y las dos que NO son la obvia:
 * - deudas       → `listDebts` + `listDebtPayments` (tabla `debt_payments`).
 * - metas        → `listGoals` + las TRANSACCIONES con `linked_kind='goal'`. NO
 *                  `goal_contributions`: esa tabla existe desde la migración 0005 pero
 *                  nadie la escribe nunca; el aporte real se registra como transacción
 *                  vinculada y sube `savings_goals.current_amount`.
 * - inversiones  → `listHoldingPurchases` (tabla `investment_transactions`).
 * - dividendos   → `listDividends` (tabla `dividends`).
 * - liquidez     → `listAccounts` + las transacciones con cuenta, que es la
 *                  trazabilidad que el usuario puede leer ("de dónde salió").
 *
 * Solo lectura. Scope de hogar heredado de los servicios (RLS por sesión).
 */
import {
  construirDetalle,
  renderDetalle,
  resolverEntidad,
  type DetalleResult,
  type Dominio,
  type Entidad,
  type Movimiento,
} from "@/lib/ai/detail-query";

export type ConsultarDetallePayload = DetalleResult & { resumen_md: string };

const DOMINIOS: Dominio[] = ["deudas", "metas", "inversiones", "dividendos", "liquidez"];

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Ventana amplia por defecto para las lecturas que necesitan un periodo. */
function periodoAmplio(hoy: string) {
  const [y] = hoy.split("-").map(Number);
  return {
    month: 1,
    year: (y ?? 1970) - 2,
    from: `${(y ?? 1970) - 2}-01-01`,
    to: hoy,
    label: "histórico",
  };
}

// ── deudas ─────────────────────────────────────────────────────────────────

async function detalleDeudas(
  nombre: string | null,
): Promise<{ entidades: Entidad[]; entidad: Entidad | null; movs: Movimiento[] }> {
  const { listDebts, listDebtPayments } = await import("@/modules/control");
  const debts = await listDebts();
  const entidades: Entidad[] = debts.map((d) => ({ id: d.id, nombre: d.name, moneda: d.currency }));
  const entidad = resolverEntidad(nombre, entidades);
  // Sin deuda nombrada se recorren todas: "cuánto he pagado en total de deudas".
  const objetivo = entidad ? entidades.filter((e) => e.id === entidad.id) : entidades;
  const porDeuda = await Promise.all(
    objetivo.map(async (e) => {
      const pagos = await listDebtPayments(e.id).catch(() => []);
      return pagos.map<Movimiento>((p) => ({
        fecha: p.paymentDate,
        etiqueta: entidad ? "Pago" : e.nombre,
        monto: p.amount,
        moneda: e.moneda ?? "CRC",
        nota: p.kind === "extraordinario" ? "abono a capital" : null,
      }));
    }),
  );
  return { entidades, entidad, movs: porDeuda.flat() };
}

// ── metas ──────────────────────────────────────────────────────────────────

async function detalleMetas(
  nombre: string | null,
  hoy: string,
): Promise<{ entidades: Entidad[]; entidad: Entidad | null; movs: Movimiento[] }> {
  const { listGoals } = await import("@/modules/control");
  const { listTransactions } = await import("@/modules/financial-base");
  const goals = await listGoals();
  const entidades: Entidad[] = goals.map((g) => ({ id: g.id, nombre: g.name, moneda: g.currency }));
  const entidad = resolverEntidad(nombre, entidades);

  // El aporte vive como transacción vinculada (linked_kind='goal'), no en goal_contributions.
  const txns = await listTransactions(periodoAmplio(hoy), {});
  const porId = new Map(entidades.map((e) => [e.id, e]));
  const movs = txns
    .filter((t) => t.linkedKind === "goal" && t.linkedId)
    .filter((t) => (entidad ? t.linkedId === entidad.id : true))
    .map<Movimiento>((t) => ({
      fecha: t.occurredOn,
      etiqueta: entidad ? "Aporte" : (porId.get(t.linkedId!)?.nombre ?? "Aporte"),
      monto: t.amount,
      moneda: t.currency,
      nota: null,
    }));
  return { entidades, entidad, movs };
}

// ── inversiones ────────────────────────────────────────────────────────────

async function detalleInversiones(
  nombre: string | null,
): Promise<{ entidades: Entidad[]; entidad: Entidad | null; movs: Movimiento[] }> {
  const { listHoldings, listHoldingPurchases } = await import("@/modules/wealth");
  const holdings = await listHoldings();
  const entidades: Entidad[] = holdings.map((h) => ({
    id: h.id,
    nombre: h.label ? `${h.label} (${h.symbol})` : h.symbol,
    moneda: h.currency,
  }));
  const entidad = resolverEntidad(nombre, entidades);
  const objetivo = entidad ? entidades.filter((e) => e.id === entidad.id) : entidades;
  const porHolding = await Promise.all(
    objetivo.map(async (e) => {
      const compras = await listHoldingPurchases(e.id).catch(() => []);
      return compras.map<Movimiento>((c) => ({
        fecha: c.occurredOn,
        etiqueta: entidad ? "Compra" : e.nombre,
        monto: c.amount,
        moneda: c.currency,
        nota: c.quantity ? `${c.quantity} u.` : null,
      }));
    }),
  );
  return { entidades, entidad, movs: porHolding.flat() };
}

// ── dividendos ─────────────────────────────────────────────────────────────

async function detalleDividendos(
  nombre: string | null,
): Promise<{ entidades: Entidad[]; entidad: Entidad | null; movs: Movimiento[] }> {
  const { listHoldings, listDividends } = await import("@/modules/wealth");
  const holdings = await listHoldings();
  const entidades: Entidad[] = holdings.map((h) => ({
    id: h.id,
    nombre: h.label ? `${h.label} (${h.symbol})` : h.symbol,
    moneda: h.currency,
  }));
  const entidad = resolverEntidad(nombre, entidades);
  const divs = await listDividends(entidad?.id);
  const porId = new Map(entidades.map((e) => [e.id, e]));
  const movs = divs.map<Movimiento>((d) => ({
    fecha: d.paymentDate,
    etiqueta: entidad ? "Dividendo" : (porId.get(d.holdingId)?.nombre ?? "Dividendo"),
    monto: d.amount,
    moneda: d.currency,
    nota: null,
  }));
  return { entidades, entidad, movs: movs.filter((m) => m.fecha) };
}

// ── liquidez ───────────────────────────────────────────────────────────────

async function detalleLiquidez(
  nombre: string | null,
  hoy: string,
): Promise<{ entidades: Entidad[]; entidad: Entidad | null; movs: Movimiento[] }> {
  const { listAccounts, listTransactions } = await import("@/modules/financial-base");
  const cuentas = await listAccounts();
  const entidades: Entidad[] = cuentas.map((c) => ({
    id: c.id,
    nombre: c.name,
    moneda: c.currency,
  }));
  const entidad = resolverEntidad(nombre, entidades);

  // La trazabilidad legible ("de dónde salió") son las transacciones CON cuenta asignada.
  const txns = await listTransactions(periodoAmplio(hoy), {});
  const movs = txns
    .filter((t) => t.accountId)
    .filter((t) => (entidad ? t.accountId === entidad.id : true))
    .map<Movimiento>((t) => ({
      fecha: t.occurredOn,
      etiqueta: t.merchantOrSource ?? t.description ?? "Movimiento",
      // El signo es el dato: un gasto sale de la cuenta, un ingreso entra.
      monto: t.kind === "ingreso" ? t.amount : -t.amount,
      moneda: t.currency,
      nota: t.accountLabel ?? null,
    }));
  return { entidades, entidad, movs };
}

/**
 * Ejecuta la consulta de detalle. `moneda` es la de VISUALIZACIÓN; los montos de cada
 * movimiento conservan SU moneda y el total solo se convierte si hay tasas para todas.
 */
export async function consultarDetalle(
  args: Record<string, unknown>,
  moneda: string,
): Promise<ConsultarDetallePayload> {
  const { userToday } = await import("@/lib/time/user-time");
  const { getFxRates } = await import("@/lib/market-data/fx-rates");

  const dominioArg = str(args.dominio) as Dominio | null;
  const dominio: Dominio = dominioArg && DOMINIOS.includes(dominioArg) ? dominioArg : "deudas";
  const nombre = str(args.nombre);
  const tope = typeof args.tope === "number" && Number.isFinite(args.tope) ? args.tope : undefined;
  const hoy = await userToday();

  const datos =
    dominio === "deudas"
      ? await detalleDeudas(nombre)
      : dominio === "metas"
        ? await detalleMetas(nombre, hoy)
        : dominio === "inversiones"
          ? await detalleInversiones(nombre)
          : dominio === "dividendos"
            ? await detalleDividendos(nombre)
            : await detalleLiquidez(nombre, hoy);

  const rates = await getFxRates().catch(() => null);

  const resultado = construirDetalle(datos.movs, {
    dominio,
    entidad: datos.entidad,
    nombrePedido: nombre,
    moneda,
    rates,
    tope,
    disponibles: datos.entidades.map((e) => e.nombre),
  });

  return { ...resultado, resumen_md: renderDetalle(resultado) };
}
