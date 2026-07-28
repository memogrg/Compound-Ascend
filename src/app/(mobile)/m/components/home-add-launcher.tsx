"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  getSpendFormDataAction,
  getIncomeFormDataAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { Account, BudgetItem } from "@/modules/financial-base/types";

import dynamic from "next/dynamic";

import { Fab, BottomSheet, PlusChoiceSheet } from "./form-kit";

/**
 * Los formularios de dominio se cargan en su PROPIO chunk, al abrir cada hoja — no en el JS
 * inicial de Inicio, que debe seguir ligero. El "Abriendo…" enmascara TANTO los datos
 * on-demand como la carga del chunk: en `abrirGasto`/`abrirIngreso` ambos se piden en paralelo
 * (Promise.all con el import), así que cuando la hoja monta el form el chunk ya está listo.
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

/**
 * El "+" de Inicio. En vez de un formulario PROPIO (el viejo quick-add), abre EXACTAMENTE los
 * mismos formularios de dominio que las pantallas de Gastos e Ingresos:
 *  · Gasto  → `AddSpendForm` (el de /m/gastos, con su SobrePicker).
 *  · Ingreso → `FuentePickerSheet` → `ReceiveForm` (el flujo de /m/ingresos).
 *
 * Los datos que esos formularios necesitan (jars/accounts para el gasto, fuentes/recibido para
 * el ingreso) se cargan BAJO DEMANDA al abrir cada uno —vía loadBaseView, el agregado caro—, no
 * en el arranque de Inicio. Inicio ya no carga nada para el "+", así que arranca más ligero.
 */
type SpendData = { jars: Jar[]; accounts: Account[]; currency: string };
type IncomeData = { sources: BudgetItem[]; received: Record<string, number>; currency: string };

export function HomeAddLauncher() {
  const router = useRouter();
  const [plusOpen, setPlusOpen] = useState(false);

  // Gasto: la hoja abre al instante con "Abriendo…" y monta AddSpendForm cuando llegan los datos.
  const [spendOpen, setSpendOpen] = useState(false);
  const [spend, setSpend] = useState<SpendData | null>(null);

  // Ingreso: carga → picker de fuentes → ReceiveForm de la fuente elegida.
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [income, setIncome] = useState<IncomeData | null>(null);
  const [receiving, setReceiving] = useState<BudgetItem | null>(null);

  const abrirGasto = async () => {
    setSpend(null);
    setSpendOpen(true);
    // Datos + chunk del form EN PARALELO: el "Abriendo…" los enmascara a los dos, y cuando
    // `spend` llega el AddSpendForm ya tiene su JS listo (sin flash de carga del chunk).
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
    setIncome(null);
    setReceiving(null);
    setIncomeLoading(true);
    // Datos + chunk del flujo de ingreso en paralelo (mismo módulo para picker y ReceiveForm),
    // enmascarados por el "Abriendo…": al llegar `income`, el picker monta con su JS listo.
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

  const guardado = () => {
    cerrarGasto();
    cerrarIngreso();
    router.refresh();
  };

  return (
    <>
      <Fab onClick={() => setPlusOpen(true)} label="Registrar movimiento" />

      <PlusChoiceSheet
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        title="¿Qué registras?"
        options={[
          {
            key: "gasto",
            label: "Registrar un gasto",
            desc: "Anótalo en su sobre",
            onSelect: abrirGasto,
          },
          {
            key: "ingreso",
            label: "Registrar un ingreso",
            desc: "Anota lo recibido en una fuente",
            onSelect: abrirIngreso,
          },
        ]}
      />

      {/* Gasto → el MISMO AddSpendForm de /m/gastos (datos on-demand). */}
      <BottomSheet open={spendOpen} onClose={cerrarGasto} title="Registrar gasto">
        {spend ? (
          <AddSpendForm
            jars={spend.jars}
            currency={spend.currency}
            accounts={spend.accounts}
            onSuccess={guardado}
          />
        ) : (
          <div className="muted" style={{ padding: "20px 2px", fontSize: 13.5 }}>Abriendo…</div>
        )}
      </BottomSheet>

      {/* Ingreso · mientras cargan las fuentes. Mismo título que el picker: solo cambia el cuerpo. */}
      <BottomSheet open={incomeLoading} onClose={cerrarIngreso} title="¿A cuál fuente?">
        <div className="muted" style={{ padding: "20px 2px", fontSize: 13.5 }}>Abriendo…</div>
      </BottomSheet>

      {/* Ingreso · paso 1: elegir la fuente (el MISMO FuentePicker de /m/ingresos). */}
      {income ? (
        <FuentePickerSheet
          open={!receiving}
          sources={income.sources}
          onPick={(s) => setReceiving(s)}
          onClose={cerrarIngreso}
        />
      ) : null}

      {/* Ingreso · paso 2: el MISMO ReceiveForm de /m/ingresos, para la fuente elegida. */}
      <BottomSheet open={!!receiving} onClose={() => setReceiving(null)} title="Registrar lo recibido">
        {receiving && income ? (
          <ReceiveForm
            source={receiving}
            received={income.received[receiving.id] ?? 0}
            onSuccess={guardado}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}
