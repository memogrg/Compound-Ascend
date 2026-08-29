"use client";

import { useState } from "react";

import {
  setOpeningBalanceAction,
  reconcileBalanceAction,
} from "@/modules/financial-base/api/actions";

import {
  BottomSheet,
  FormShell,
  MoneyField,
  SheetSelect,
  CUR_OPTS,
} from "../../components/form-kit";
import { MSummaryCard, mAmount } from "../../components/content-kit";

/**
 * Gestión de liquidez en /m/mi-base-financiera, replicando la LiquidityCard web con el
 * Form Kit: si no hay saldo inicial → "Fijar saldo inicial" (setOpeningBalanceAction);
 * si ya hay → "Ajustar saldo" (reconcileBalanceAction). BottomSheet + FormShell (pending/
 * toast/refresh). Las actions toman un número (opening/reconcileSchema). es-MX.
 */
export function LiquidityManager({
  balance,
  currency,
  hasOpening,
}: {
  balance: number;
  currency: string;
  hasOpening: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | undefined>(hasOpening ? balance : undefined);
  // Moneda del saldo inicial declarado (#87). Default = la principal (el prop `currency` ya es la
  // principal: el saco se lee normalizado a ella). Solo se elige en la apertura; el ajuste
  // (reconcile) sigue en principal.
  const [cur, setCur] = useState(currency);

  const openSheet = () => {
    setAmount(hasOpening ? balance : undefined);
    setOpen(true);
  };

  // Apertura: pasa la moneda elegida a setOpeningBalanceAction. Ajuste: reconcile en principal.
  // Ambas encajan en (amount: number) → ActionResult para FormShell.
  const action = hasOpening
    ? reconcileBalanceAction
    : (amt: number) => setOpeningBalanceAction(amt, cur);

  return (
    <>
      <MSummaryCard
        eyebrow="Tu liquidez"
        // Exacto mientras quepa en una línea a 320px (~11 caracteres); más allá, abreviado.
        value={mAmount(balance, currency, 11)}
        tone={balance < 0 ? "danger" : "neutral"}
        sub={
          hasOpening
            ? "Tu saldo inicial más todo lo que ha entrado y salido este mes."
            : "Define tu saldo inicial para afinar este cálculo."
        }
        slot={
          hasOpening ? (
            <button type="button" className="m-btn m-btn-secondary" onClick={openSheet}>
              Ajustar saldo
            </button>
          ) : (
            <button type="button" className="m-btn m-btn-block m-btn-primary" onClick={openSheet}>
              Fijar saldo inicial
            </button>
          )
        }
        style={{ marginBottom: 16 }}
      />

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={hasOpening ? "Ajustar saldo" : "Fijar saldo inicial"}
      >
        <FormShell
          action={action}
          values={amount ?? 0}
          submitLabel="Guardar"
          successMessage={hasOpening ? "Saldo ajustado" : "Saldo inicial guardado"}
          onSuccess={() => setOpen(false)}
        >
          <MoneyField
            name="amount"
            label={hasOpening ? "Tu saldo real hoy" : "¿Cuánto tienes líquido hoy?"}
            value={amount}
            onChange={setAmount}
            currency={hasOpening ? currency : cur}
          />
          {hasOpening ? null : (
            <SheetSelect
              name="currency"
              label="Moneda"
              value={cur}
              onChange={setCur}
              options={CUR_OPTS}
              sheetTitle="Moneda"
            />
          )}
        </FormShell>
      </BottomSheet>
    </>
  );
}
