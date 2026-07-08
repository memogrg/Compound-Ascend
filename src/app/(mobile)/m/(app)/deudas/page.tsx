import Link from "next/link";
import { MobileMenu } from "../../components/mobile-menu";
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
import { formatMoney } from "@/lib/format";
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
          <Header />
          <div className="ov" style={{ marginBottom: 8 }}>
            Sin deudas registradas 🎉
          </div>
          <DebtManager items={[]} raw={raw} paymentsByDebt={paymentsByDebt} currency={currency} />
        </div>
      </div>
    );
  }

  const total = debts.reduce((s, d) => s + d.balance, 0);
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

  const items: DebtItem[] = ordered.map((vm, i) => ({
    vm,
    rank: i + 1,
    months: monthsById.get(vm.id) ?? null,
  }));

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <Header />

        {/* Hero: deuda total */}
        <div
          className="hero-nw"
          style={{
            marginBottom: 16,
            background: "linear-gradient(155deg, color-mix(in srgb, var(--danger) 16%, var(--surface)), var(--surface) 62%)",
            borderColor: "color-mix(in srgb, var(--danger) 22%, var(--border))",
          }}
        >
          <div className="ov">Deuda total</div>
          <div className="hero-amt" style={{ color: "var(--danger)", marginTop: 6 }}>
            {formatMoney(total, currency)}
          </div>
          <div className="delta" style={{ marginTop: 8, color: "var(--text-muted)" }}>
            {debts.length} {debts.length === 1 ? "deuda activa" : "deudas activas"}
          </div>
        </div>

        {/* Estrategia de pago */}
        <div style={{ marginBottom: 16 }}>
          <div className="ov" style={{ marginBottom: 10 }}>
            Estrategia de pago
          </div>
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

        {/* Próximo pago */}
        {next && (
          <div
            className="card card-p"
            style={{ marginBottom: 16, background: "var(--accent-soft)", borderColor: "transparent" }}
          >
            <div className="between">
              <div>
                <div className="ov" style={{ color: "var(--accent)" }}>
                  Próximo pago
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6 }}>{next.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Vence {fmtDate(next.nextDue)}
                </div>
              </div>
              <div className="display" style={{ fontSize: 22 }}>
                {formatMoney(next.monthlyPayment || next.minPayment, currency)}
              </div>
            </div>
          </div>
        )}

        {/* Lista de deudas gestionable (SwipeRow editar/eliminar + reportar pago + historial) */}
        <div>
          <div className="between" style={{ marginBottom: 6 }}>
            <div className="sec-title">Tus deudas</div>
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
              orden · {METHOD_LABEL[rec.method]?.toLowerCase() ?? rec.method}
            </span>
          </div>
          <DebtManager items={items} raw={raw} paymentsByDebt={paymentsByDebt} currency={currency} />
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="hdr" style={{ marginBottom: 16 }}>
      <Link href="/m" className="bk" aria-label="Volver a Inicio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </Link>
      <div style={{ flex: 1 }}>
        <div className="ov">Control</div>
        <div className="h-title" style={{ marginTop: 2 }}>
          Deudas y Préstamos
        </div>
      </div>
      <MobileMenu />
    </div>
  );
}
