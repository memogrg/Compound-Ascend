"use client";

import { useState } from "react";

import {
  setOpeningBalanceAction,
  reconcileBalanceAction,
} from "@/modules/financial-base/api/actions";
import { formatMoney } from "@/lib/format";

import { BottomSheet, FormShell, MoneyField } from "../../components/form-kit";

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

  const openSheet = () => {
    setAmount(hasOpening ? balance : undefined);
    setOpen(true);
  };

  // Ambas actions toman (amount: number) → ActionResult; misma firma para FormShell.
  const action = hasOpening ? reconcileBalanceAction : setOpeningBalanceAction;

  return (
    <div className="card card-p" style={{ marginBottom: 14 }}>
      <div className="ov" style={{ marginBottom: 6 }}>
        Tu liquidez
      </div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {formatMoney(balance, currency)}
      </div>

      {hasOpening ? (
        <button type="button" className="m-btn m-btn-secondary" style={{ marginTop: 12 }} onClick={openSheet}>
          Ajustar saldo
        </button>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12, margin: "6px 0 12px" }}>
            Define tu saldo inicial para afinar este cálculo.
          </div>
          <button type="button" className="m-btn m-btn-primary" onClick={openSheet}>
            Fijar saldo inicial
          </button>
        </>
      )}

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
            currency={currency}
          />
        </FormShell>
      </BottomSheet>
    </div>
  );
}
