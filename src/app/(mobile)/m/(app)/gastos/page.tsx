import Link from "next/link";
import { MobileMenu } from "../../components/mobile-menu";
import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { getExpenseJarsAsOf } from "@/modules/financial-base/services/expense-jars-service";
import { monthPeriod, getBaseSummary } from "@/modules/financial-base";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import { formatMoney } from "@/lib/format";
import { ExpenseManager } from "./expense-manager";

/**
 * /m/gastos — "Gastos": frascos (grupos) con sobres (categorías), presupuesto vs
 * gastado. Reutiliza EXACTAMENTE la lógica del web /gastos: loadBaseView +
 * getExpenseJarsAsOf (mismos services que la web importa directo; sin duplicar).
 * Piel del diseño (data-screen="gastos"), es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

/** Total gastado/presupuestado de un frasco (normal = suma de sobres; vinculado = totals). */
function jarTotals(jar: Jar): { spent: number; budget: number } {
  if (jar.kind === "normal") {
    return jar.envelopes.reduce(
      (acc, e) => ({ spent: acc.spent + e.spent, budget: acc.budget + e.budget }),
      { spent: 0, budget: 0 },
    );
  }
  if (jar.totals) return { spent: jar.totals.spent, budget: jar.totals.budget };
  return jar.items.reduce(
    (acc, it) => ({ spent: acc.spent + (it.spent ?? 0), budget: acc.budget + (it.budget ?? 0) }),
    { spent: 0, budget: 0 },
  );
}

export default async function MobileGastos() {
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          <Header />
          <div className="card card-p">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Aún no puedes ver tus gastos. Captura tu base financiera para empezar.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const period = monthPeriod(now.getFullYear(), now.getMonth() + 1);
  const asOf = now.toISOString().slice(0, 10);
  const currency = view.currency;
  const jars = await getExpenseJarsAsOf({ tree: view.tree, period, asOf, currency });
  // Lista gestionable (líneas de gasto), en paralelo a la vista de frascos.
  const expenses = (await getBaseSummary()).expenses;

  const totals = jars.reduce(
    (acc, j) => {
      const t = jarTotals(j);
      return { spent: acc.spent + t.spent, budget: acc.budget + t.budget };
    },
    { spent: 0, budget: 0 },
  );
  const pct = totals.budget > 0 ? Math.min(1, totals.spent / totals.budget) : 0;
  const available = totals.budget - totals.spent;
  const anyData = jars.length > 0 && totals.budget > 0;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <Header pct={totals.budget > 0 ? Math.round((totals.spent / totals.budget) * 100) : null} />

        {/* Resumen del mes */}
        <div className="card card-p" style={{ marginBottom: 16 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <span className="ov">Gastado del mes</span>
            <span className="mono" style={{ fontSize: 12.5 }}>
              {formatMoney(totals.spent, currency)} / {formatMoney(totals.budget, currency)}
            </span>
          </div>
          <div className="bar" style={{ height: 9 }}>
            <i style={{ width: `${Math.round(pct * 100)}%`, background: totals.spent > totals.budget ? "var(--danger)" : "var(--accent)" }} />
          </div>
          <div className="between" style={{ marginTop: 10 }}>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {available >= 0 ? `Disponible ${formatMoney(available, currency)}` : `Excedido ${formatMoney(-available, currency)}`}
            </span>
          </div>
        </div>

        {/* Frascos */}
        {!anyData ? (
          <div className="card card-p">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Aún no tienes presupuesto por categorías. Defínelo para organizar tus gastos en frascos y sobres.
            </div>
          </div>
        ) : (
          jars.map((jar) => <JarCard key={jar.group} jar={jar} currency={currency} />)
        )}

        {/* Tus gastos: lista gestionable (SwipeRow editar/eliminar) + FAB de alta */}
        <div className="between" style={{ margin: "18px 0 6px" }}>
          <div className="sec-title">Tus gastos</div>
          {expenses.length > 0 && (
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
              {expenses.length} {expenses.length === 1 ? "línea" : "líneas"}
            </span>
          )}
        </div>
        <ExpenseManager expenses={expenses} currency={currency} />
      </div>
    </div>
  );
}

function JarCard({ jar, currency }: { jar: Jar; currency: string }) {
  const { spent, budget } = jarTotals(jar);
  const over = spent > budget && budget > 0;
  const pct = budget > 0 ? Math.min(1, spent / budget) : 0;
  const sub =
    jar.kind === "normal"
      ? `${jar.envelopes.length} ${jar.envelopes.length === 1 ? "sobre" : "sobres"}`
      : "Pagos del mes";

  return (
    <div className="jar">
      <div className="jar-top">
        <span
          className="jar-ic"
          style={
            over
              ? { background: "var(--danger-soft)", color: "var(--danger)" }
              : { background: "var(--accent-soft)", color: "var(--accent)" }
          }
          aria-hidden
        >
          <JarIcon jar={jar} />
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {jar.name}
            {over && (
              <span className="badge down" style={{ marginLeft: 6 }}>
                {Math.round((spent / budget) * 100)}%
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {sub}
          </div>
        </div>
        <div className="jar-amt">
          <div className={`a${over ? " neg" : ""}`}>{formatMoney(spent, currency)}</div>
          {budget > 0 ? <div className="b">de {formatMoney(budget, currency)}</div> : null}
        </div>
      </div>

      {budget > 0 && (
        <div className="bar" style={{ height: 7, marginTop: 12 }}>
          <i style={{ width: `${Math.round(pct * 100)}%`, background: over ? "var(--danger)" : "var(--accent)" }} />
        </div>
      )}

      {jar.kind === "normal"
        ? jar.envelopes.map((e) => (
            <div className="sobre" key={e.id}>
              <span className="sn">{e.name}</span>
              <span className="sv" style={e.spent > e.budget && e.budget > 0 ? { color: "var(--danger)" } : undefined}>
                {formatMoney(e.spent, currency)} / {formatMoney(e.budget, currency)}
              </span>
            </div>
          ))
        : jar.items.map((it) => (
            <div className="sobre" key={it.id}>
              <span className="sn">{it.name}</span>
              <span className="sv">{it.amount}</span>
            </div>
          ))}

      {jar.kind === "linked" && jar.linkedKind === "debt" && (
        <Link href="/m/deudas" className="jar-link">
          Ver deudas
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}
    </div>
  );
}

function JarIcon({ jar }: { jar: Jar }) {
  const kind = jar.kind === "linked" ? jar.linkedKind : "normal";
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (kind === "debt") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (kind === "goal") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    );
  }
  if (kind === "holding") {
    return (
      <svg {...common}>
        <path d="M3 17l6-6 4 4 8-9M14 6h6v6" />
      </svg>
    );
  }
  if (kind === "policy") {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" />
      <path d="M7 3v2M11 3v2" />
    </svg>
  );
}

function Header({ pct }: { pct?: number | null }) {
  return (
    <div className="hdr" style={{ marginBottom: 16 }}>
      <Link href="/m" className="bk" aria-label="Volver a Inicio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </Link>
      <div style={{ flex: 1 }}>
        <div className="ov">Base</div>
        <div className="h-title" style={{ marginTop: 2 }}>
          Gastos
        </div>
      </div>
      {pct != null && <span className="badge neutral">{pct}%</span>}
      <MobileMenu />
    </div>
  );
}
