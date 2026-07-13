"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { focusFirstError } from "@/lib/forms";
import { useDeepLinkModal } from "@/lib/hooks/use-deep-link-modal";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  addInvestmentAction,
  addPolicyAction,
  editInvestmentAction,
  editPolicyAction,
  type ActionResult,
} from "@/modules/wealth/api/actions";
import type { Investment, InsurancePolicy } from "@/modules/wealth/types";

type Mode = "investment" | "policy";

const ASSET_TYPES = [
  ["etf", "ETF"],
  ["accion", "Acción"],
  ["bono", "Bono"],
  ["fondo", "Fondo"],
  ["certificado", "Certificado"],
  ["inmueble", "Bienes raíces"],
  ["cripto", "Cripto"],
  ["negocio", "Negocio"],
  ["pension", "Pensión"],
  ["otro", "Otro"],
] as const;

const POLICY_TYPES = [
  ["medico", "Médico"],
  ["vida", "Vida"],
  ["incapacidad", "Incapacidad / ingresos"],
  ["hogar", "Hogar"],
  ["vehiculo", "Vehículo"],
  ["patrimonial", "Patrimonial"],
  ["familiar", "Familiar"],
  ["otro", "Otro"],
] as const;

export function WealthActions({
  mode,
  currency = "CRC",
  deepLinkKey,
}: {
  mode: Mode;
  currency?: string;
  deepLinkKey?: string;
}) {
  const [open, setOpen] = useState(false);
  useDeepLinkModal(deepLinkKey, () => setOpen(true));
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name={mode === "investment" ? "invest" : "defense"} width={2} />
        {mode === "investment" ? "Agregar inversión" : "Añadir póliza"}
      </button>
      {open ? (
        <WealthDialog mode={mode} currency={currency} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** Botón de editar (inversión / póliza). */
export function EditWealthButton({
  mode,
  item,
  currency,
}: {
  mode: Mode;
  item: Investment | InsurancePolicy;
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
        <WealthDialog mode={mode} currency={currency} item={item} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function WealthDialog({
  mode,
  currency,
  item,
  onClose,
}: {
  mode: Mode;
  currency: string;
  item?: Investment | InsurancePolicy;
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
    ? mode === "investment"
      ? "Editar inversión"
      : "Editar póliza"
    : mode === "investment"
      ? "Agregar inversión"
      : "Añadir póliza";
  return (
    <Modal
      title={title}
      sub={
        mode === "investment"
          ? "Cuéntanos dónde está creciendo tu dinero."
          : "Registremos tus coberturas para detectar brechas."
      }
      onClose={onClose}
    >
      {mode === "investment" ? (
        <InvestmentForm currency={currency} onDone={done} item={item as Investment | undefined} />
      ) : (
        <PolicyForm currency={currency} onDone={done} item={item as InsurancePolicy | undefined} />
      )}
    </Modal>
  );
}

function useSubmit(action: (raw: unknown) => Promise<ActionResult>) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const run = async (payload: unknown, onOk: () => void, form?: HTMLFormElement) => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const res = await action(payload);
    setPending(false);
    if (res.ok) onOk();
    else {
      if (res.fieldErrors) {
        setErrors(res.fieldErrors);
        focusFirstError(form, res.fieldErrors);
      }
      if (res.message) setMessage(res.message);
    }
  };
  return { pending, errors, message, run };
}

function sym(currency: string): string {
  return { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";
}

function InvestmentForm({
  currency,
  onDone,
  item,
}: {
  currency: string;
  onDone: () => void;
  item?: Investment;
}) {
  const action = item ? (raw: unknown) => editInvestmentAction(item.id, raw) : addInvestmentAction;
  const { pending, errors, message, run } = useSubmit(action);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    run(
      {
        name: String(fd.get("name") ?? ""),
        assetType: String(fd.get("assetType") ?? "etf"),
        symbol: String(fd.get("symbol") ?? "") || undefined,
        investedAmount: Number(fd.get("investedAmount") ?? 0),
        contribution: Number(fd.get("contribution") ?? 0),
        currency: String(fd.get("currency") ?? currency),
        horizon: String(fd.get("horizon") ?? "") || undefined,
      },
      onDone,
      form,
    );
  };
  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? (
          <div className="auth-msg warn" role="alert">
            {message}
          </div>
        ) : null}
        <div className="fld">
          <label className="fld-label">Nombre o descripción</label>
          <input
            className="inp"
            name="name"
            defaultValue={item?.name ?? ""}
            placeholder="ETF S&P 500, apartamento…"
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
            <label className="fld-label">Tipo</label>
            <select className="sel" name="assetType" defaultValue={item?.assetType ?? "etf"}>
              {ASSET_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Símbolo (opcional)</label>
            <input
              className="inp"
              name="symbol"
              defaultValue={item?.symbol ?? ""}
              placeholder="VOO, BTC…"
            />
          </div>
        </div>
        <div className="fld-2">
          <Money
            label="Monto invertido"
            name="investedAmount"
            currency={currency}
            error={errors.investedAmount}
            defaultValue={item?.investedAmount}
          />
          <Money
            label="Aporte mensual"
            name="contribution"
            currency={currency}
            defaultValue={item?.contribution}
          />
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Horizonte</label>
            <select className="sel" name="horizon" defaultValue={item?.horizon ?? "5_10"}>
              <option value="menos_1">Menos de 1 año</option>
              <option value="1_3">1 a 3 años</option>
              <option value="3_5">3 a 5 años</option>
              <option value="5_10">5 a 10 años</option>
              <option value="mas_10">Más de 10 años</option>
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Moneda</label>
            <select className="sel" name="currency" defaultValue={item?.currency ?? currency}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <Foot pending={pending} onCancel={onDone} />
    </form>
  );
}

function PolicyForm({
  currency,
  onDone,
  item,
}: {
  currency: string;
  onDone: () => void;
  item?: InsurancePolicy;
}) {
  const action = item ? (raw: unknown) => editPolicyAction(item.id, raw) : addPolicyAction;
  const { pending, message, run } = useSubmit(action);
  const [cur, setCur] = useState<string>(item?.currency ?? currency);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    run(
      {
        policyType: String(fd.get("policyType") ?? "medico"),
        provider: String(fd.get("provider") ?? "") || undefined,
        coverage: Number(fd.get("coverage") ?? 0) || undefined,
        premium: Number(fd.get("premium") ?? 0) || undefined,
        premiumFrequency: String(fd.get("premiumFrequency") ?? "mensual"),
        currency: cur,
      },
      onDone,
      form,
    );
  };
  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? (
          <div className="auth-msg warn" role="alert">
            {message}
          </div>
        ) : null}
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Tipo de cobertura</label>
            <select className="sel" name="policyType" defaultValue={item?.policyType ?? "medico"}>
              {POLICY_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Aseguradora (opcional)</label>
            <input
              className="inp"
              name="provider"
              defaultValue={item?.provider ?? ""}
              placeholder="Nombre"
            />
          </div>
        </div>
        <div className="fld-2">
          <Money
            label="Suma asegurada"
            name="coverage"
            currency={cur}
            defaultValue={item?.coverage ?? undefined}
          />
          <Money
            label="Prima"
            name="premium"
            currency={cur}
            defaultValue={item?.premium ?? undefined}
          />
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Frecuencia de la prima</label>
            <select
              className="sel"
              name="premiumFrequency"
              defaultValue={item?.premiumFrequency ?? "mensual"}
            >
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>
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
        </div>
      </div>
      <Foot pending={pending} onCancel={onDone} />
    </form>
  );
}

function Money({
  label,
  name,
  currency,
  error,
  defaultValue,
}: {
  label: string;
  name: string;
  currency: string;
  error?: string;
  defaultValue?: number;
}) {
  return (
    <div className="fld">
      <label className="fld-label">{label}</label>
      <div className="inp-money">
        <span className="pre">{sym(currency)}</span>
        <input
          name={name}
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaultValue}
          placeholder="0"
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error ? (
        <span className="auth-err" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function Foot({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="modal-foot">
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancelar
      </button>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}
