import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { EssentialExpenseSummary } from "@/modules/wealth/components/essential-summary";
import { getExpenseJarsAsOf } from "@/modules/financial-base/services/expense-jars-service";
import { getExpenseRangeView } from "@/modules/financial-base/services/expense-range-service";
import { monthPeriod } from "@/modules/financial-base/engine/period";
import { IncomeExpenseSection } from "@/modules/financial-base/components/v2/sections";
import { createSavingsSobreAction } from "@/modules/control";
import { PagoVinculadoButton } from "@/modules/control";
import { userToday } from "@/lib/time/user-time";
import { RitmoPanel } from "@/components/shared/ritmo-panel";
import { getSenalesRitmo } from "@/lib/rhythm/rhythm-service";
import { isCurrentMonth } from "@/modules/financial-base/engine/period";

/**
 * El escáner de recibos de este tab (`ScanReceiptButton`) llama a una SERVER ACTION, y una server
 * action hereda el presupuesto de tiempo del segmento desde el que se invoca — no el de ninguna
 * ruta de API. Sin esto corría con el default de la cuenta (~10-15s) y moría a mitad de la visión,
 * exactamente el mismo fallo intermitente que /api/assistant/scan-receipt. 60s es el mismo número
 * y la misma cuenta: ver el cálculo en esa ruta.
 */
export const maxDuration = 60;

/** Fecha de corte de los frascos: ?asOf=YYYY-MM-DD válido, o el día de hoy (zona del usuario). */
async function resolveAsOf(raw: string | undefined): Promise<string> {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return userToday();
}

/** Gastos — ruta propia. Lee del mismo modelo V2 (budget_items + transactions). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="auth-msg warn" style={{ margin: 0 }}>
        Conecta Supabase para gestionar tus gastos.
      </div>
    );
  }

  // Filtro propio de "Categorías de gasto": los frascos reflejan el mes del día
  // elegido, con el gasto real cortado a ese día. No re-scopea cards ni gráficas.
  const asOf = await resolveAsOf(sp.asOf);
  const [ay, am] = asOf.split("-").map(Number) as [number, number];
  const jarsPeriod = monthPeriod(ay, am);

  // Filtro propio de las 4 cards + 2 gráficas: rango (1m/3m/6m/YTD/All). No
  // re-scopea los frascos. Se computa en paralelo con los frascos del asOf.
  const [jars, rangeView] = await Promise.all([
    getExpenseJarsAsOf({ tree: view.tree, period: jarsPeriod, asOf, currency: view.currency }),
    getExpenseRangeView(sp.range, view.period),
  ]);

  const expenseView = {
    ...view,
    jars,
    history: rangeView.history,
    budget: { ...view.budget, budgetExpense: rangeView.budgetExpense },
    real: {
      ...view.real,
      realExpense: rangeView.realExpense,
      expenseByKey: rangeView.expenseByKey,
    },
  };

  // Un botón por entidad de los frascos vinculados con compromiso mensual: aportar a una meta
  // (Ahorro) y pagar una deuda (Deudas). Mismo componente, mismo mapa, distinto `kind`.
  const goalActions: Record<string, React.ReactNode> = {};
  for (const jar of jars) {
    if (jar.kind !== "linked") continue;
    const kind = jar.linkedKind === "goal" ? "meta" : jar.linkedKind === "debt" ? "deuda" : null;
    if (!kind) continue;
    for (const it of jar.items) {
      goalActions[it.id] = (
        <PagoVinculadoButton kind={kind} id={it.id} name={it.name} tone="compact" />
      );
    }
  }

  // Avisos de ritmo: solo del mes EN CURSO. Proyectar "a este ritmo llegás a X" sobre un mes
  // ya cerrado no es un aviso, es un dato de museo — y sobre uno futuro no hay ritmo todavía.
  // Best-effort: un fallo acá no puede tumbar el tab de Gastos.
  const ritmo = isCurrentMonth(jarsPeriod, asOf)
    ? await getSenalesRitmo(jarsPeriod).catch(() => ({ senales: [], dia: 0 }))
    : { senales: [], dia: 0 };

  return (
    <div className="grid">
      <EssentialExpenseSummary />
      <RitmoPanel senales={ritmo.senales} dia={ritmo.dia} />
      <IncomeExpenseSection
        view={expenseView}
        kind="expense"
        jarsAsOf={asOf}
        jarsPeriod={jarsPeriod}
        range={rangeView.range}
        createSavingsSobre={createSavingsSobreAction}
        /* El botón de aporte vive en `control`; la página es la que puede componer los dos
           módulos sin invertir la dependencia (control → financial-base, nunca al revés).
           Van los ELEMENTOS ya construidos, no una función: `JarRow` es un client component y
           React no deja pasarle funciones desde el servidor. */
        goalActions={goalActions}
      />
    </div>
  );
}
