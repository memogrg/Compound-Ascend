"use client";

import { useState } from "react";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { focusFirstError } from "@/lib/forms";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  addAssetAction,
  addLiabilityAction,
  editAssetAction,
  editLiabilityAction,
  type ActionResult,
} from "@/modules/rich-life/api/actions";
import type { Asset, Liability } from "@/modules/rich-life/types";
import { currencySymbol } from "@/lib/format";

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

/** Botón de alta (activo / pasivo) que abre su propio diálogo. Reutilizable
 * en la toolbar y en los estados vacíos accionables. */
export function AddRichButton({
  kind,
  currency,
  label,
  variant = "btn-primary",
}: {
  kind: Kind;
  currency: string;
  label?: string;
  variant?: "btn-primary" | "btn-secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn ${variant}`} onClick={() => setOpen(true)}>
        <Icon name={kind === "asset" ? "networth" : "debt"} width={2} />{" "}
        {label ?? (kind === "asset" ? "Agregar activo" : "Agregar pasivo")}
      </button>
      {open ? <RichDialog kind={kind} currency={currency} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function RichActions({ currency = "CRC" }: { currency?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <AddRichButton kind="asset" currency={currency} variant="btn-primary" />
      <AddRichButton kind="liability" currency={currency} variant="btn-secondary" />
    </div>
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
  const toast = useToast();
  const editing = Boolean(item);
  const done = () => {
    toast(editing ? "Cambios guardados" : "Agregado");
    onClose();
    router.refresh();
  };
  const title = editing
    ? kind === "asset"
      ? "Editar activo"
      : "Editar pasivo"
    : kind === "asset"
      ? "Agregar activo"
      : "Agregar pasivo";
  return (
    <Modal
      title={title}
      sub="No buscamos exactitud contable, buscamos dirección."
      onClose={onClose}
    >
      <Form kind={kind} currency={currency} onDone={done} item={item} />
    </Modal>
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

  const assetItem = kind === "asset" ? (item as Asset | undefined) : undefined;
  const liabItem = kind === "liability" ? (item as Liability | undefined) : undefined;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setErrors({});
    setMessage(null);
    const fd = new FormData(form);
    let res: ActionResult;
    if (kind === "asset") {
      const payload = {
        name: String(fd.get("name") ?? ""),
        assetClass: String(fd.get("assetClass") ?? "liquido"),
        value: Number(fd.get("value") ?? 0),
        currency: String(fd.get("currency") ?? currency),
        generatesIncome: fd.get("generatesIncome") === "on",
      };
      res = assetItem
        ? await editAssetAction(assetItem.id, payload)
        : await addAssetAction(payload);
    } else {
      const payload = {
        name: String(fd.get("name") ?? ""),
        liabilityClass: String(fd.get("liabilityClass") ?? "consumo"),
        balance: Number(fd.get("balance") ?? 0),
        currency: String(fd.get("currency") ?? currency),
      };
      res = liabItem
        ? await editLiabilityAction(liabItem.id, payload)
        : await addLiabilityAction(payload);
    }
    setPending(false);
    if (res.ok) onDone();
    else {
      if (res.fieldErrors) {
        setErrors(res.fieldErrors);
        focusFirstError(form, res.fieldErrors);
      }
      if (res.message) setMessage(res.message);
    }
  };

  const defValue = assetItem?.value ?? liabItem?.balance;
  // CONTROLADO: el select era `defaultValue` y el símbolo salía del prop `currency`, así
  // que cambiar la moneda no movía el símbolo — se enseñaba ₡ y se guardaba USD. Los dos
  // leen ahora el mismo estado.
  const captureCurrency = useCaptureCurrency();
  const [cur, setCur] = useState(item?.currency ?? captureCurrency);
  const sym = currencySymbol(cur);

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? (
          <div className="auth-msg warn" role="alert">
            {message}
          </div>
        ) : null}
        <div className="fld">
          <label className="fld-label">Nombre</label>
          <input
            className="inp"
            name="name"
            defaultValue={item?.name ?? ""}
            placeholder={kind === "asset" ? "Casa, carro, inversión…" : "Hipoteca, préstamo…"}
            required
            aria-invalid={errors.name ? true : undefined}
          />
          {errors.name ? (
            <span className="auth-err" role="alert">
              {errors.name}
            </span>
          ) : null}
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
                aria-invalid={errors.value || errors.balance ? true : undefined}
              />
            </div>
            {errors.value || errors.balance ? (
              <span className="auth-err" role="alert">
                {errors.value ?? errors.balance}
              </span>
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
            <select
              className="sel"
              name="currency"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {kind === "asset" ? (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                alignSelf: "end",
                paddingBottom: 12,
              }}
            >
              <input
                type="checkbox"
                name="generatesIncome"
                defaultChecked={assetItem?.generatesIncome ?? false}
              />{" "}
              Genera ingreso
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
