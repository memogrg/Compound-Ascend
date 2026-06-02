"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { addAssetAction, addLiabilityAction, type ActionResult } from "@/modules/rich-life/api/actions";

const ASSET_CLASSES = [
  ["liquido", "Líquido (efectivo, ahorro)"],
  ["inversion", "Inversión"],
  ["productivo", "Productivo (genera ingreso)"],
  ["uso_personal", "Uso personal"],
  ["especial", "Especial"],
] as const;

const LIAB_CLASSES = [
  ["consumo", "Consumo"],
  ["patrimonial", "Patrimonial"],
  ["productivo", "Productivo"],
  ["critico", "Crítico"],
] as const;

export function RichActions({ currency = "CRC" }: { currency?: string }) {
  const [open, setOpen] = useState<"asset" | "liability" | null>(null);
  const router = useRouter();
  const done = () => {
    setOpen(null);
    router.refresh();
  };

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setOpen("asset")}>
          <Icon name="networth" width={2} /> Agregar activo
        </button>
        <button className="btn btn-secondary" onClick={() => setOpen("liability")}>
          <Icon name="debt" width={2} /> Agregar pasivo
        </button>
      </div>

      {open && (
        <div className="modal-scrim open" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="modal" role="dialog">
            <div className="modal-head">
              <div>
                <div className="modal-title">{open === "asset" ? "Agregar activo" : "Agregar pasivo"}</div>
                <div className="modal-sub">No buscamos exactitud contable, buscamos dirección.</div>
              </div>
              <button className="modal-x" aria-label="Cerrar" onClick={() => setOpen(null)}>
                <Icon name="x" width={2} />
              </button>
            </div>
            <Form kind={open} currency={currency} onDone={done} />
          </div>
        </div>
      )}
    </>
  );
}

function Form({
  kind,
  currency,
  onDone,
}: {
  kind: "asset" | "liability";
  currency: string;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const sym = { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    let res: ActionResult;
    if (kind === "asset") {
      res = await addAssetAction({
        name: String(fd.get("name") ?? ""),
        assetClass: String(fd.get("assetClass") ?? "liquido"),
        value: Number(fd.get("value") ?? 0),
        currency: String(fd.get("currency") ?? currency),
        generatesIncome: fd.get("generatesIncome") === "on",
      });
    } else {
      res = await addLiabilityAction({
        name: String(fd.get("name") ?? ""),
        liabilityClass: String(fd.get("liabilityClass") ?? "consumo"),
        balance: Number(fd.get("balance") ?? 0),
        currency: String(fd.get("currency") ?? currency),
      });
    }
    setPending(false);
    if (res.ok) onDone();
    else {
      if (res.fieldErrors) setErrors(res.fieldErrors);
      if (res.message) setMessage(res.message);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? <div className="auth-msg warn">{message}</div> : null}
        <div className="fld">
          <label className="fld-label">Nombre</label>
          <input className="inp" name="name" placeholder={kind === "asset" ? "Casa, carro, inversión…" : "Hipoteca, préstamo…"} required />
          {errors.name ? <span className="auth-err">{errors.name}</span> : null}
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">{kind === "asset" ? "Valor estimado" : "Saldo"}</label>
            <div className="inp-money">
              <span className="pre">{sym}</span>
              <input name={kind === "asset" ? "value" : "balance"} type="number" step="0.01" min="0" placeholder="0" />
            </div>
            {errors.value || errors.balance ? (
              <span className="auth-err">{errors.value ?? errors.balance}</span>
            ) : null}
          </div>
          <div className="fld">
            <label className="fld-label">Tipo</label>
            <select className="sel" name={kind === "asset" ? "assetClass" : "liabilityClass"}>
              {(kind === "asset" ? ASSET_CLASSES : LIAB_CLASSES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Moneda</label>
            <select className="sel" name="currency" defaultValue={currency}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {kind === "asset" ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, alignSelf: "end", paddingBottom: 12 }}>
              <input type="checkbox" name="generatesIncome" /> Genera ingreso
            </label>
          ) : (
            <div />
          )}
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
