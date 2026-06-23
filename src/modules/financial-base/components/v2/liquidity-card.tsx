"use client";

/**
 * Tarjeta "Tu Liquidez" (Saco de Liquidez): el stock real de dinero disponible.
 * Mínima por diseño — saldo + tooltip "?" + pregunta de saldo inicial (estado
 * vacío) + "Ajustar saldo" (reconciliación 1-toque). Sin métricas patrimoniales.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import {
  setOpeningBalanceAction,
  reconcileBalanceAction,
} from "@/modules/financial-base/api/actions";

const HELP =
  "Tu dinero disponible real: el saldo del que entra y sale todo. Sube con ingresos, baja con gastos, aportes a metas y pagos de deuda.";

export function LiquidityCard({
  balance,
  currency,
  hasOpening,
}: {
  balance: number;
  currency: string;
  hasOpening: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [adjusting, setAdjusting] = useState(false);
  const [value, setValue] = useState("");

  const submit = (mode: "opening" | "adjust") =>
    startTransition(async () => {
      const amount = Number(value);
      if (!Number.isFinite(amount)) {
        toast("Escribe un monto válido.", "error");
        return;
      }
      const res =
        mode === "opening"
          ? await setOpeningBalanceAction(amount)
          : await reconcileBalanceAction(amount);
      if (res.ok) {
        toast(mode === "opening" ? "Saldo inicial guardado." : "Saldo ajustado.");
        setValue("");
        setAdjusting(false);
        router.refresh();
      } else {
        toast(res.message ?? "No se pudo guardar.", "error");
      }
    });

  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="card-title">Tu Liquidez</div>
        <span
          className="muted"
          title={HELP}
          aria-label={HELP}
          style={{
            cursor: "help",
            width: 18,
            height: 18,
            borderRadius: 999,
            border: "1px solid var(--line)",
            display: "grid",
            placeItems: "center",
            fontSize: 11,
          }}
        >
          ?
        </span>
      </div>

      {hasOpening ? (
        <>
          <div className="num-xl" style={{ fontSize: 34, marginTop: 10 }}>
            {formatMoney(balance, currency)}
          </div>
          {adjusting ? (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <input
                type="number"
                inputMode="decimal"
                className="inp"
                placeholder="Tu saldo real hoy"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                style={{ flex: "1 1 140px" }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => submit("adjust")}
                disabled={pending}
              >
                Guardar
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setAdjusting(false);
                  setValue("");
                }}
                disabled={pending}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 12, padding: "8px 14px" }}
              onClick={() => setAdjusting(true)}
            >
              <Icon name="edit" width={2} /> Ajustar saldo
            </button>
          )}
        </>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 14, color: "var(--ink)", marginBottom: 8 }}>
            ¿Cuánto tienes líquido hoy?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="number"
              inputMode="decimal"
              className="inp"
              placeholder={`Monto en ${currency}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{ flex: "1 1 160px" }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => submit("opening")}
              disabled={pending}
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
