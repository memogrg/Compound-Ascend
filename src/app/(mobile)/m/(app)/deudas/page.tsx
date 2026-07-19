import { MobileHeader } from "../../components/mobile-header";
import {
  getDebtsOverview,
  getDebtDetail,
  getIndexRates,
  simulateStrategy,
  orderDebts,
  recommendMethod,
  type DebtVM,
  type DebtPayment,
} from "@/modules/control";
import type { DebtInput } from "@/modules/control/engine/debt-strategy";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MMetricGrid,
  MMetricCard,
  MChip,
  MProgress,
  mAmount,
} from "../../components/content-kit";
import { DebtManager, type DebtItem } from "./debt-manager";

/**
 * /m/deudas — "Deudas y Préstamos": deuda total, estrategia de pago (avalancha/bola de
 * nieve), próximo pago y gestión completa de deudas. Reutiliza el barrel control
 * (getDebtsOverview + engine simulateStrategy/orderDebts/recommendMethod) para la lectura
 * y las Server Actions del módulo (vía DebtManager) para CRUD + reportar pago (transacción
 * vinculada) + historial. Sin reimplementar cálculos. es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const METHOD_LABEL: Record<string, string> = {
  avalancha: "Avalancha",
  bola_nieve: "Bola de nieve",
  hibrido: "Híbrido",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

export default async function MobileDeudas() {
  const rates = await getIndexRates();
  const ov = await getDebtsOverview(rates);
  const { currency, debts, freeCashflow, raw } = ov;

  // Pagos por deuda (moneda de visualización, ya normalizada por getDebtDetail).
  const details = await Promise.all(debts.map((d) => getDebtDetail(d.id, rates)));
  const paymentsByDebt: Record<string, DebtPayment[]> = {};
  for (const det of details) {
    if (det) paymentsByDebt[det.id] = det.payments;
  }

  if (debts.length === 0) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          <MobileHeader variant="inner" eyebrow="Control" title="Deudas y Préstamos" backHref="/m" backLabel="Volver a Inicio" />
          {/* Aquí se veían DOS vacíos seguidos: este ("Sin deudas registradas 🎉", con
              emoji donde el resto del móvil usa MIcon) y, justo debajo, el del manager
              con items=[]. Ahora el mensaje vive en un solo sitio: el del manager, que es
              el que además tiene el FAB para crear la primera. */}
          <DebtManager items={[]} raw={raw} paymentsByDebt={paymentsByDebt} currency={currency} />
        </div>
      </div>
    );
  }

  // getDebtsOverview YA convirtió cada deuda a la moneda de display (balance, minPayment…
  // salen de conv(...) en debts-service), así que aquí se suma en crudo: convertir otra
  // vez sería el error. Esto NO es como Ahorro, donde la meta guarda su moneda nativa.
  const total = debts.reduce((s, d) => s + d.balance, 0);
  // Avance global = lo pagado sobre lo pedido. Solo cuentan las deudas que guardan su
  // monto original: sin él no se sabe qué se pagó, y meterlas falsearía el porcentaje.
  const conOriginal = debts.filter((d) => d.originalAmount && d.originalAmount > 0);
  const totalOriginal = conOriginal.reduce((s, d) => s + (d.originalAmount ?? 0), 0);
  const totalPendienteDeEsas = conOriginal.reduce((s, d) => s + d.balance, 0);
  const pagado = Math.max(0, totalOriginal - totalPendienteDeEsas);
  const pctPagado = totalOriginal > 0 ? Math.min(1, pagado / totalOriginal) : 0;
  // Lo que hay que pagar este mes (mínimos) y la tasa que más duele.
  const minMes = debts.reduce((s, d) => s + (d.monthlyPayment || d.minPayment), 0);
  const peorApr = debts.reduce((worst, d) => (d.apr > (worst?.apr ?? -1) ? d : worst), debts[0]!);
  const inputs: DebtInput[] = debts.map((d) => ({
    id: d.id,
    name: d.name,
    balance: d.balance,
    apr: d.apr,
    minPayment: d.minPayment,
  }));
  const extra = Math.max(0, freeCashflow);
  const rec = recommendMethod(inputs);
  const aval = simulateStrategy(inputs, "avalancha", extra);
  const snow = simulateStrategy(inputs, "bola_nieve", extra);
  const saving = Math.max(0, snow.totalInterest - aval.totalInterest); // avalancha ahorra intereses

  const sim = simulateStrategy(inputs, rec.method, extra);
  const monthsById = new Map(sim.payoffOrder.map((p) => [p.id, p.monthPaid]));
  const orderedIds = orderDebts(inputs, rec.method).map((d) => d.id);
  const ordered: DebtVM[] = orderedIds
    .map((id) => debts.find((d) => d.id === id))
    .filter((d): d is DebtVM => Boolean(d));
  const next = ordered[0];
  // ¿La cuota más próxima ya venció? Solo presentación: el cálculo de nextDue no se toca.
  // Fecha local en ISO ("sv-SE" da YYYY-MM-DD) para comparar cadenas sin líos de zona.
  const todayIso = new Date().toLocaleDateString("sv-SE");
  const overdue = Boolean(next?.nextDue && next.nextDue < todayIso);

  const items: DebtItem[] = ordered.map((vm, i) => ({
    vm,
    rank: i + 1,
    months: monthsById.get(vm.id) ?? null,
  }));

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" eyebrow="Control" title="Deudas y Préstamos" backHref="/m" backLabel="Volver a Inicio" />

        {/* Resumen: lo que debes (exacto mientras quepa) y cuánto llevas pagado. */}
        <MSummaryCard
          eyebrow="Deuda total"
          value={mAmount(total, currency, 11)}
          tone="danger"
          chip={totalOriginal > 0 ? <MChip tone="success">{formatPercent(pctPagado)} pagado</MChip> : undefined}
          sub={
            totalOriginal > 0
              ? `Llevas ${formatMoney(pagado, currency)} pagados de ${formatMoney(totalOriginal, currency)} que pediste.`
              : `${debts.length} ${debts.length === 1 ? "deuda activa" : "deudas activas"}.`
          }
          slot={totalOriginal > 0 ? <MProgress value={pctPagado} tone="success" height={9} /> : undefined}
          style={{ marginBottom: 16 }}
        />

        {/* Métricas: lo que no está en el resumen ni en "Próximo pago". */}
        <MSectionHeader title="Tus deudas en números" />
        <MMetricGrid style={{ marginBottom: 16 }}>
          <MMetricCard
            label="Deudas activas"
            value={String(debts.length)}
            sub={sim.feasible ? `libre en ≈${sim.months} meses` : "los mínimos no bastan"}
            tone={sim.feasible ? "neutral" : "danger"}
          />
          <MMetricCard
            label="A pagar este mes"
            value={mAmount(minMes, currency, 8)}
            sub="suma de tus cuotas"
          />
          <MMetricCard
            label="APR más alta"
            value={formatPercent(peorApr.apr / 100, 1)}
            sub={peorApr.name}
            tone="danger"
          />
          <MMetricCard
            label="Intereses del plan"
            value={mAmount(sim.totalInterest, currency, 8)}
            sub={`con ${METHOD_LABEL[rec.method]?.toLowerCase() ?? rec.method}`}
            tone="warning"
          />
        </MMetricGrid>

        {/* Estrategia de pago */}
        <MSectionHeader title="Estrategia de pago" />
        <div style={{ marginBottom: 16 }}>
          <div className="row" style={{ gap: 10, alignItems: "stretch" }}>
            <div className={`mcard${rec.method === "avalancha" ? " sel" : ""}`}>
              <div className="mt">Avalancha</div>
              <div className="md">Ataca la tasa más alta primero</div>
              <div className="mm">{saving > 0 ? `Ahorra ${formatMoney(saving, currency)}` : "Menos intereses"}</div>
            </div>
            <div className={`mcard${rec.method === "bola_nieve" ? " sel" : ""}`}>
              <div className="mt">Bola de nieve</div>
              <div className="md">Liquida la más pequeña primero</div>
              <div className="mm">Más motivación</div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>
            Recomendado para ti: <strong>{METHOD_LABEL[rec.method] ?? rec.method}</strong>. {rec.reason}
          </div>
        </div>

        {/* Próximo pago: conserva su tinte de acento (es su identidad), con el contenedor
            del kit — igual que el motor de prioridades de Ahorro. */}
        {next && (
          <MContentCard style={{ marginBottom: 16, background: "var(--accent-soft)" }}>
            <div className="between">
              <div style={{ minWidth: 0 }}>
                <div className="ov" style={{ color: "var(--accent)" }}>
                  Próximo pago
                </div>
                <div
                  style={{ fontWeight: 700, fontSize: 15, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {next.name}
                </div>
                {/* "Vence el 1 de julio" mostrado el 18 de julio se lee como un error de la
                    app, pero el dato es correcto: la cuota de este mes está VENCIDA (el
                    engine solo salta al mes siguiente si ya pagaste). Se dice en pasado y en
                    rojo cuando la fecha ya pasó, en vez de anunciar un futuro que no existe. */}
                <div
                  className={overdue ? "neg" : "muted"}
                  style={{ fontSize: 12, marginTop: 2, fontWeight: overdue ? 600 : undefined }}
                >
                  {overdue ? `Venció el ${fmtDate(next.nextDue)}` : `Vence ${fmtDate(next.nextDue)}`}
                </div>
              </div>
              <div className="display" style={{ fontSize: 22, flex: "none" }}>
                {mAmount(next.monthlyPayment || next.minPayment, currency, 9)}
              </div>
            </div>
          </MContentCard>
        )}

        {/* Lista de deudas gestionable (SwipeRow editar/eliminar + reportar pago + historial) */}
        <MSectionHeader
          title="Tus deudas"
          action={
            <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
              orden · {METHOD_LABEL[rec.method]?.toLowerCase() ?? rec.method}
            </span>
          }
        />
        <DebtManager items={items} raw={raw} paymentsByDebt={paymentsByDebt} currency={currency} />
      </div>
    </div>
  );
}

