"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { addInvestmentAction, addPolicyAction, type ActionResult } from "@/modules/wealth/api/actions";

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
}: {
  mode: "investment" | "policy";
  currency?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const done = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name={mode === "investment" ? "invest" : "defense"} width={2} />
        {mode === "investment" ? "Agregar inversión" : "Añadir póliza"}
      </button>

      {open && (
        <div className="modal-scrim open" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" role="dialog">
            <div className="modal-head">
              <div>
                <div className="modal-title">
                  {mode === "investment" ? "Agregar inversión" : "Añadir póliza"}
                </div>
                <div className="modal-sub">
                  {mode === "investment"
                    ? "Cuéntanos dónde está creciendo tu dinero."
                    : "Registremos tus coberturas para detectar brechas."}
                </div>
              </div>
              <button className="modal-x" aria-label="Cerrar" onClick={() => setOpen(false)}>
                <Icon name="x" width={2} />
              </button>
            </div>
            {mode === "investment" ? (
              <InvestmentForm currency={currency} onDone={done} />
            ) : (
              <PolicyForm currency={currency} onDone={done} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function useSubmit(action: (raw: unknown) => Promise<ActionResult>) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const run = async (payload: unknown, onOk: () => void) => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const res = await action(payload);
    setPending(false);
    if (res.ok) onOk();
    else {
      if (res.fieldErrors) setErrors(res.fieldErrors);
      if (res.message) setMessage(res.message);
    }
  };
  return { pending, errors, message, run };
}

function sym(currency: string): string {
  return { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";
}

function InvestmentForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const { pending, errors, message, run } = useSubmit(addInvestmentAction);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
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
    );
  };
  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? <div className="auth-msg warn">{message}</div> : null}
        <div className="fld">
          <label className="fld-label">Nombre o descripción</label>
          <input className="inp" name="name" placeholder="ETF S&P 500, apartamento…" required />
          {errors.name ? <span className="auth-err">{errors.name}</span> : null}
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Tipo</label>
            <select className="sel" name="assetType" defaultValue="etf">
              {ASSET_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Símbolo (opcional)</label>
            <input className="inp" name="symbol" placeholder="VOO, BTC…" />
          </div>
        </div>
        <div className="fld-2">
          <Money label="Monto invertido" name="investedAmount" currency={currency} error={errors.investedAmount} />
          <Money label="Aporte mensual" name="contribution" currency={currency} />
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Horizonte</label>
            <select className="sel" name="horizon" defaultValue="mas_5">
              <option value="menos_1">Menos de 1 año</option>
              <option value="1_3">1 a 3 años</option>
              <option value="3_5">3 a 5 años</option>
              <option value="mas_5">Más de 5 años</option>
            </select>
          </div>
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
        </div>
      </div>
      <Foot pending={pending} onCancel={onDone} />
    </form>
  );
}

function PolicyForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const { pending, message, run } = useSubmit(addPolicyAction);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(
      {
        policyType: String(fd.get("policyType") ?? "medico"),
        provider: String(fd.get("provider") ?? "") || undefined,
        coverage: Number(fd.get("coverage") ?? 0) || undefined,
        premium: Number(fd.get("premium") ?? 0) || undefined,
        premiumFrequency: String(fd.get("premiumFrequency") ?? "mensual"),
        currency: String(fd.get("currency") ?? currency),
      },
      onDone,
    );
  };
  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? <div className="auth-msg warn">{message}</div> : null}
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Tipo de cobertura</label>
            <select className="sel" name="policyType" defaultValue="medico">
              {POLICY_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Aseguradora (opcional)</label>
            <input className="inp" name="provider" placeholder="Nombre" />
          </div>
        </div>
        <div className="fld-2">
          <Money label="Suma asegurada" name="coverage" currency={currency} />
          <Money label="Prima" name="premium" currency={currency} />
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Frecuencia de la prima</label>
            <select className="sel" name="premiumFrequency" defaultValue="mensual">
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>
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
}: {
  label: string;
  name: string;
  currency: string;
  error?: string;
}) {
  return (
    <div className="fld">
      <label className="fld-label">{label}</label>
      <div className="inp-money">
        <span className="pre">{sym(currency)}</span>
        <input name={name} type="number" step="0.01" min="0" placeholder="0" />
      </div>
      {error ? <span className="auth-err">{error}</span> : null}
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
