"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  addAssetAction,
  addLiabilityAction,
  editAssetAction,
  editLiabilityAction,
  type ActionResult,
} from "@/modules/rich-life/api/actions";
import type { Asset, Liability } from "@/modules/rich-life/types";

type Kind = "asset" | "liability";

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
  const [open, setOpen] = useState<Kind | null>(null);
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
      {open ? <RichDialog kind={open} currency={currency} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** Botón de editar (activo / pasivo). */
export function EditRichButton({
  kind,
  item,
  currency,
}: {
  kind: Kind;
  item: Asset | Liability;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-btn"
        style={{ width: 30, height: 30 }}
        aria-label="Editar"
        title="Editar"
        onClick={() => setOpen(true)}
      >
        <Icon name="edit" />
      </button>
      {open ? (
        <RichDialog kind={kind} currency={currency} item={item} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function RichDialog({
  kind,
  currency,
  item,
  onClose,
}: {
  kind: Kind;
  currency: string;
  item?: Asset | Liability;
  onClose: () => void;
}) {
  const router = useRouter();
  const done = () => {
    onClose();
    router.refresh();
  };
  const editing = Boolean(item);
  return (
    <div className="modal-scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog">
        <div className="modal-head">
          <div>
            <div className="modal-title">
              {editing
                ? kind === "asset"
                  ? "Editar activo"
                  : "Editar pasivo"
                : kind === "asset"
                  ? "Agregar activo"
                  : "Agregar pasivo"}
            </div>
            <div className="modal-sub">No buscamos exactitud contable, buscamos dirección.</div>
          </div>
          <button className="modal-x" aria-label="Cerrar" onClick={onClose}>
            <Icon name="x" width={2} />
          </button>
        </div>
        <Form kind={kind} currency={currency} onDone={done} item={item} />
      </div>
    </div>
  );
}

function Form({
  kind,
  currency,
  onDone,
  item,
}: {
  kind: Kind;
  currency: string;
  onDone: () => void;
  item?: Asset | Liability;
}) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const sym = { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";

  const assetItem = kind === "asset" ? (item as Asset | undefined) : undefined;
  const liabItem = kind === "liability" ? (item as Liability | undefined) : undefined;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    let res: ActionResult;
    if (kind === "asset") {
      const payload = {
        name: String(fd.get("name") ?? ""),
        assetClass: String(fd.get("assetClass") ?? "liquido"),
        value: Number(fd.get("value") ?? 0),
        currency: String(fd.get("currency") ?? currency),
        generatesIncome: fd.get("generatesIncome") === "on",
      };
      res = assetItem ? await editAssetAction(assetItem.id, payload) : await addAssetAction(payload);
    } else {
      const payload = {
        name: String(fd.get("name") ?? ""),
        liabilityClass: String(fd.get("liabilityClass") ?? "consumo"),
        balance: Number(fd.get("balance") ?? 0),
        currency: String(fd.get("currency") ?? currency),
      };
      res = liabItem ? await editLiabilityAction(liabItem.id, payload) : await addLiabilityAction(payload);
    }
    setPending(false);
    if (res.ok) onDone();
    else {
      if (res.fieldErrors) setErrors(res.fieldErrors);
      if (res.message) setMessage(res.message);
    }
  };

  const defValue = assetItem?.value ?? liabItem?.balance;
  const defCurrency = item?.currency ?? currency;

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? <div className="auth-msg warn">{message}</div> : null}
        <div className="fld">
          <label className="fld-label">Nombre</label>
          <input
            className="inp"
            name="name"
            defaultValue={item?.name ?? ""}
            placeholder={kind === "asset" ? "Casa, carro, inversión…" : "Hipoteca, préstamo…"}
            required
          />
          {errors.name ? <span className="auth-err">{errors.name}</span> : null}
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">{kind === "asset" ? "Valor estimado" : "Saldo"}</label>
            <div className="inp-money">
              <span className="pre">{sym}</span>
              <input
                name={kind === "asset" ? "value" : "balance"}
                type="number"
                step="0.01"
                min="0"
                defaultValue={defValue}
                placeholder="0"
              />
            </div>
            {errors.value || errors.balance ? (
              <span className="auth-err">{errors.value ?? errors.balance}</span>
            ) : null}
          </div>
          <div className="fld">
            <label className="fld-label">Tipo</label>
            <select
              className="sel"
              name={kind === "asset" ? "assetClass" : "liabilityClass"}
              defaultValue={assetItem?.assetClass ?? liabItem?.liabilityClass}
            >
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
            <select className="sel" name="currency" defaultValue={defCurrency}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {kind === "asset" ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, alignSelf: "end", paddingBottom: 12 }}>
              <input type="checkbox" name="generatesIncome" defaultChecked={assetItem?.generatesIncome ?? false} /> Genera ingreso
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
