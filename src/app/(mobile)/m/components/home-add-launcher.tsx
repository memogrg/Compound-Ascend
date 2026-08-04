"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import {
  getSpendFormDataAction,
  getIncomeFormDataAction,
} from "@/modules/financial-base/api/v2-actions";
import {
  getDebtPayTargetsAction,
  getGoalContribTargetsAction,
  reportPaymentAction,
} from "@/modules/control/api/actions";
import {
  getHoldingContribTargetsAction,
  getPolicyPremiumTargetsAction,
} from "@/modules/wealth/api/actions";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { Account, BudgetItem } from "@/modules/financial-base/types";
import type { DebtVM } from "@/modules/control/services/debts-service";
import type { Debt, SavingsGoal } from "@/modules/control/types";
import type { HoldingPerformance, HoldingNativo, InsurancePolicy } from "@/modules/wealth/types";

import { Fab, BottomSheet } from "./form-kit";

/**
 * Los formularios de dominio se cargan en su PROPIO chunk, al abrir cada hoja — no en el JS
 * inicial de Inicio. El "Abriendo…" enmascara TANTO los datos on-demand como la carga del
 * chunk: en cada `abrir*` se piden en paralelo (Promise.all con el import), así que cuando
 * la hoja monta el form el chunk ya está listo.
 *
 * Los VINCULADOS reusan EXACTAMENTE el picker+form de su pantalla de dominio (mismos
 * componentes, misma acción canónica): NO crean un gasto plano — cada uno mueve liquidez con
 * su signo y escribe su fila vinculada por el orquestador (ver
 * artifacts/auditoria/inicio-gasto-sobres-vinculados.md, Opción C).
 */
const AddSpendForm = dynamic(
  () => import("../(app)/gastos/gastos-forms").then((m) => m.AddSpendForm),
  { ssr: false, loading: () => null },
);
const FuentePickerSheet = dynamic(
  () => import("../(app)/ingresos/income-manager").then((m) => m.FuentePickerSheet),
  { ssr: false, loading: () => null },
);
const ReceiveForm = dynamic(
  () => import("../(app)/ingresos/income-manager").then((m) => m.ReceiveForm),
  { ssr: false, loading: () => null },
);
const DebtPickerSheet = dynamic(
  () => import("../(app)/deudas/debt-manager").then((m) => m.DebtPickerSheet),
  { ssr: false, loading: () => null },
);
const PaymentForm = dynamic(
  () => import("../(app)/deudas/debt-manager").then((m) => m.PaymentForm),
  { ssr: false, loading: () => null },
);
const GoalPickerSheet = dynamic(
  () => import("../(app)/metas/goal-manager").then((m) => m.GoalPickerSheet),
  { ssr: false, loading: () => null },
);
const ContributionForm = dynamic(
  () => import("../(app)/metas/goal-manager").then((m) => m.ContributionForm),
  { ssr: false, loading: () => null },
);
const HoldingPickerSheet = dynamic(
  () => import("../(app)/inversiones/inversiones-forms").then((m) => m.HoldingPickerSheet),
  { ssr: false, loading: () => null },
);
const ContributeHoldingForm = dynamic(
  () => import("../(app)/inversiones/inversiones-forms").then((m) => m.ContributeHoldingForm),
  { ssr: false, loading: () => null },
);
const PolicyPickerSheet = dynamic(
  () => import("../(app)/proteccion/proteccion-manager").then((m) => m.PolicyPickerSheet),
  { ssr: false, loading: () => null },
);
const PremiumForm = dynamic(
  () => import("../(app)/proteccion/proteccion-manager").then((m) => m.PremiumForm),
  { ssr: false, loading: () => null },
);

type SpendData = { jars: Jar[]; accounts: Account[]; currency: string };
type IncomeData = { sources: BudgetItem[]; received: Record<string, number>; currency: string };
type DebtData = { debts: DebtVM[]; raw: Debt[]; currency: string };
type GoalData = { goals: SavingsGoal[] };
type InvData = { holdings: HoldingPerformance[]; rawHoldings: HoldingNativo[]; currency: string };
type PolData = { policies: InsurancePolicy[] };

const Abriendo = () => (
  <div className="muted" style={{ padding: "20px 2px", fontSize: 13.5 }}>
    Abriendo…
  </div>
);

/** Opción de la hoja "Registrar una salida" (mismo estilo que los pickers). */
function SalidaOpt({ label, desc, onSelect }: { label: string; desc: string; onSelect: () => void }) {
  return (
    <button type="button" className="m-opt" onClick={onSelect}>
      <span className="m-opt-t">{label}</span>
      <span className="m-opt-d">{desc}</span>
    </button>
  );
}

/**
 * El "+" de Inicio. Abre EXACTAMENTE los formularios de dominio (no un quick-add propio):
 *  · Salida → hoja con Sobres (AddSpendForm) + Vinculados (deuda/meta/inversión/prima).
 *  · Ingreso → FuentePickerSheet → ReceiveForm (flujo de /m/ingresos).
 * Cada destino carga sus datos + su chunk bajo demanda, enmascarado por "Abriendo…".
 */
export function HomeAddLauncher() {
  const router = useRouter();
  // Una sola hoja de registro (salidas + entrada): sin chooser intermedio → todo a 2 toques.
  const [menuOpen, setMenuOpen] = useState(false);

  // Gasto normal.
  const [spendOpen, setSpendOpen] = useState(false);
  const [spend, setSpend] = useState<SpendData | null>(null);

  // Ingreso.
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [income, setIncome] = useState<IncomeData | null>(null);
  // La fuente elegida se guarda con su "recibido": el picker llama a su `onClose` (que limpia
  // `income`) antes que a `onPick`, así que el form no puede depender de `income`.
  const [receiving, setReceiving] = useState<{ source: BudgetItem; received: number } | null>(null);

  // Vinculados: cada uno = loading + data + entidad elegida (capturada para no depender de `data`).
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtData, setDebtData] = useState<DebtData | null>(null);
  const [payingDebt, setPayingDebt] = useState<{ debtId: string; currency: string } | null>(null);

  const [goalLoading, setGoalLoading] = useState(false);
  const [goalData, setGoalData] = useState<GoalData | null>(null);
  const [contribGoal, setContribGoal] = useState<SavingsGoal | null>(null);

  const [invLoading, setInvLoading] = useState(false);
  const [invData, setInvData] = useState<InvData | null>(null);
  const [contribHolding, setContribHolding] = useState<{ holding: HoldingNativo; currency: string } | null>(null);

  const [polLoading, setPolLoading] = useState(false);
  const [polData, setPolData] = useState<PolData | null>(null);
  const [payingPolicy, setPayingPolicy] = useState<InsurancePolicy | null>(null);

  const abrirGasto = async () => {
    setMenuOpen(false);
    setSpend(null);
    setSpendOpen(true);
    const [data] = await Promise.all([
      getSpendFormDataAction(),
      import("../(app)/gastos/gastos-forms"),
    ]);
    setSpend(data);
  };
  const cerrarGasto = () => {
    setSpendOpen(false);
    setSpend(null);
  };

  const abrirIngreso = async () => {
    setMenuOpen(false);
    setIncome(null);
    setReceiving(null);
    setIncomeLoading(true);
    const [data] = await Promise.all([
      getIncomeFormDataAction(),
      import("../(app)/ingresos/income-manager"),
    ]);
    setIncome(data);
    setIncomeLoading(false);
  };
  const cerrarIngreso = () => {
    setIncome(null);
    setReceiving(null);
    setIncomeLoading(false);
  };

  const abrirDeuda = async () => {
    setMenuOpen(false);
    setDebtData(null);
    setPayingDebt(null);
    setDebtLoading(true);
    const [data] = await Promise.all([
      getDebtPayTargetsAction(),
      import("../(app)/deudas/debt-manager"),
    ]);
    setDebtData(data);
    setDebtLoading(false);
  };
  const cerrarDeuda = () => {
    setDebtData(null);
    setPayingDebt(null);
    setDebtLoading(false);
  };

  const abrirMeta = async () => {
    setMenuOpen(false);
    setGoalData(null);
    setContribGoal(null);
    setGoalLoading(true);
    const [data] = await Promise.all([
      getGoalContribTargetsAction(),
      import("../(app)/metas/goal-manager"),
    ]);
    setGoalData(data);
    setGoalLoading(false);
  };
  const cerrarMeta = () => {
    setGoalData(null);
    setContribGoal(null);
    setGoalLoading(false);
  };

  const abrirInversion = async () => {
    setMenuOpen(false);
    setInvData(null);
    setContribHolding(null);
    setInvLoading(true);
    const [data] = await Promise.all([
      getHoldingContribTargetsAction(),
      import("../(app)/inversiones/inversiones-forms"),
    ]);
    setInvData(data);
    setInvLoading(false);
  };
  const cerrarInversion = () => {
    setInvData(null);
    setContribHolding(null);
    setInvLoading(false);
  };

  const abrirPrima = async () => {
    setMenuOpen(false);
    setPolData(null);
    setPayingPolicy(null);
    setPolLoading(true);
    const [data] = await Promise.all([
      getPolicyPremiumTargetsAction(),
      import("../(app)/proteccion/proteccion-manager"),
    ]);
    setPolData(data);
    setPolLoading(false);
  };
  const cerrarPrima = () => {
    setPolData(null);
    setPayingPolicy(null);
    setPolLoading(false);
  };

  const guardado = () => {
    cerrarGasto();
    cerrarIngreso();
    cerrarDeuda();
    cerrarMeta();
    cerrarInversion();
    cerrarPrima();
    router.refresh();
  };

  const sectionLabel = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    padding: "12px 2px 4px",
  };

  return (
    <>
      <Fab onClick={() => setMenuOpen(true)} label="Registrar movimiento" />

      {/* UNA sola hoja: SALIDAS (gasto + vinculados) + ENTRADA (ingreso). Cada opción va directo
          a su picker/form → todo queda a 2 toques ("+" → opción → form). */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="¿Qué registrás?">
        <div className="m-optlist">
          <div style={sectionLabel}>Salidas</div>
          <SalidaOpt label="Gasto a un sobre" desc="Supermercado, servicios, transporte…" onSelect={abrirGasto} />
          <SalidaOpt label="Abono a una deuda" desc="Registra un pago o abono" onSelect={abrirDeuda} />
          <SalidaOpt label="Aporte a un ahorro" desc="Suma a una meta" onSelect={abrirMeta} />
          <SalidaOpt label="Invertir / aportar" desc="Aporta a una inversión" onSelect={abrirInversion} />
          <SalidaOpt label="Pagar una prima" desc="De una póliza de seguro" onSelect={abrirPrima} />
          <div style={sectionLabel}>Entrada</div>
          <SalidaOpt label="Registrar lo recibido" desc="Anota un ingreso a una fuente" onSelect={abrirIngreso} />
        </div>
      </BottomSheet>

      {/* Gasto → AddSpendForm de /m/gastos (gasto plano, sobre normal). */}
      <BottomSheet open={spendOpen} onClose={cerrarGasto} title="Registrar gasto">
        {spend ? (
          <AddSpendForm jars={spend.jars} currency={spend.currency} accounts={spend.accounts} onSuccess={guardado} />
        ) : (
          <Abriendo />
        )}
      </BottomSheet>

      {/* Ingreso */}
      <BottomSheet open={incomeLoading} onClose={cerrarIngreso} title="¿A cuál fuente?">
        <Abriendo />
      </BottomSheet>
      {income ? (
        <FuentePickerSheet
          open={!receiving}
          sources={income.sources}
          onPick={(s) => setReceiving({ source: s, received: income.received[s.id] ?? 0 })}
          onClose={cerrarIngreso}
        />
      ) : null}
      <BottomSheet open={!!receiving} onClose={() => setReceiving(null)} title="Registrar lo recibido">
        {receiving ? (
          <ReceiveForm source={receiving.source} received={receiving.received} onSuccess={guardado} />
        ) : null}
      </BottomSheet>

      {/* Vinculado · ABONO A DEUDA → reportPaymentAction (RPC atómica: txn + debt_payments + liquidez −). */}
      <BottomSheet open={debtLoading} onClose={cerrarDeuda} title="¿A cuál deuda?">
        <Abriendo />
      </BottomSheet>
      {debtData ? (
        <DebtPickerSheet
          open={!payingDebt}
          debts={debtData.debts}
          rawById={new Map(debtData.raw.map((d) => [d.id, d]))}
          currency={debtData.currency}
          onPick={(vm) =>
            setPayingDebt({
              debtId: vm.id,
              currency: debtData.raw.find((d) => d.id === vm.id)?.currency ?? debtData.currency,
            })
          }
          onClose={cerrarDeuda}
        />
      ) : null}
      <BottomSheet open={!!payingDebt} onClose={() => setPayingDebt(null)} title="Registrar pago">
        {payingDebt ? (
          <PaymentForm
            debtId={payingDebt.debtId}
            currency={payingDebt.currency}
            action={reportPaymentAction}
            submitLabel="Registrar pago"
            successMessage="Pago registrado"
            onSuccess={guardado}
          />
        ) : null}
      </BottomSheet>

      {/* Vinculado · APORTE A META → addGoalContributionAction (gasto vinculado, liquidez −). */}
      <BottomSheet open={goalLoading} onClose={cerrarMeta} title="¿A cuál ahorro?">
        <Abriendo />
      </BottomSheet>
      {goalData ? (
        <GoalPickerSheet
          open={!contribGoal}
          goals={goalData.goals}
          onPick={(g) => setContribGoal(g)}
          onClose={cerrarMeta}
        />
      ) : null}
      <BottomSheet open={!!contribGoal} onClose={() => setContribGoal(null)} title="Registrar aporte">
        {contribGoal ? <ContributionForm goal={contribGoal} onSuccess={guardado} /> : null}
      </BottomSheet>

      {/* Vinculado · INVERSIÓN → contributeToHoldingAction (compra vinculada, liquidez −). */}
      <BottomSheet open={invLoading} onClose={cerrarInversion} title="¿A cuál inversión?">
        <Abriendo />
      </BottomSheet>
      {invData ? (
        <HoldingPickerSheet
          open={!contribHolding}
          holdings={invData.holdings}
          rawById={new Map(invData.rawHoldings.map((h) => [h.id, h]))}
          onPick={(raw) => setContribHolding({ holding: raw, currency: invData.currency })}
          onClose={cerrarInversion}
        />
      ) : null}
      <BottomSheet open={!!contribHolding} onClose={() => setContribHolding(null)} title="Registrar aporte">
        {contribHolding ? (
          <ContributeHoldingForm holding={contribHolding.holding} currency={contribHolding.currency} onSuccess={guardado} />
        ) : null}
      </BottomSheet>

      {/* Vinculado · PRIMA DE PÓLIZA → payPolicyPremiumAction (prima vinculada, liquidez −). */}
      <BottomSheet open={polLoading} onClose={cerrarPrima} title="¿A cuál póliza?">
        <Abriendo />
      </BottomSheet>
      {polData ? (
        <PolicyPickerSheet
          open={!payingPolicy}
          policies={polData.policies}
          onPick={(p) => setPayingPolicy(p)}
          onClose={cerrarPrima}
        />
      ) : null}
      <BottomSheet open={!!payingPolicy} onClose={() => setPayingPolicy(null)} title="Registrar prima">
        {payingPolicy ? <PremiumForm policy={payingPolicy} onSuccess={guardado} /> : null}
      </BottomSheet>
    </>
  );
}
