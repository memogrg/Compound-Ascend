"use client";

/**
 * Importar transacciones desde CSV. Parsea en el cliente, previsualiza y manda
 * filas válidas a importTransactionsAction (entran como pendientes de revisar).
 * Columnas reconocidas (flexible): fecha/date, descripcion/comercio, monto/amount,
 * tipo/kind (ingreso|gasto), moneda/currency. Si no hay 'tipo', el signo del
 * monto decide (negativo = gasto).
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney, CURRENCY_OPTIONS } from "@/lib/format";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { importTransactionsAction } from "@/modules/financial-base/api/v2-actions";
// Parser puro compartido con la pantalla m\u00f3vil (/m/transacciones): mismas columnas, mismas reglas.
import { parseCsv, type ParsedCsvRow } from "@/modules/financial-base/engine/csv-parse";

export function CsvImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ border: "1px solid var(--line)" }}
        onClick={() => setOpen(true)}
      >
        <Icon name="upload" width={2} /> Importar CSV
      </button>
      {open ? <CsvImportModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CsvImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const captureCurrency = useCaptureCurrency();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  // Moneda por defecto para filas SIN columna de moneda: la elige el usuario,
  // default a la principal (estable), nunca a la de visualización.
  const [fallbackCurrency, setFallbackCurrency] = useState(captureCurrency);
  const [pending, startTransition] = useTransition();

  const applyParse = (text: string, fallback: string) => {
    const res = parseCsv(text, fallback);
    setRows(res.rows);
    setSkipped(res.skipped);
    return res;
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setRawText(text);
    const res = applyParse(text, fallbackCurrency);
    if (res.rows.length === 0) toast("No encontré filas válidas. Revisa las columnas.", "error");
  };

  const onFallbackChange = (code: string) => {
    setFallbackCurrency(code);
    // Re-parsea para que las filas sin moneda adopten la nueva por defecto.
    if (rawText) applyParse(rawText, code);
  };

  const doImport = () =>
    startTransition(async () => {
      const res = await importTransactionsAction(rows);
      if (res.ok) {
        toast(`Importadas ${res.count} (entran como 'Pendiente')`);
        onClose();
        router.refresh();
      } else toast(res.message ?? "No se pudo importar", "error");
    });

  return (
    <Modal
      title="Importar CSV"
      sub="Columnas: fecha, descripción, monto, tipo (ingreso/gasto), moneda."
      onClose={onClose}
    >
      <div className="modal-body">
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="upload" width={2} /> {fileName || "Elegir archivo CSV"}
        </button>

        <div className="fld" style={{ marginTop: 12 }}>
          <label className="fld-label" htmlFor="csv-fallback-cur" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Moneda por defecto
            <span
              className="tip"
              data-tip="Se aplica solo a las filas que no traen columna de moneda. Por defecto, tu moneda principal."
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 15,
                height: 15,
                borderRadius: "50%",
                border: "1px solid var(--line)",
                color: "var(--muted)",
                fontSize: 10,
                fontWeight: 700,
                flex: "none",
              }}
            >
              ?
            </span>
          </label>
          <select
            id="csv-fallback-cur"
            className="sel"
            value={fallbackCurrency}
            onChange={(e) => onFallbackChange(e.target.value)}
            aria-label="Moneda por defecto del CSV"
          >
            {CURRENCY_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.code}
                {o.code === captureCurrency ? " (principal)" : ""}
              </option>
            ))}
          </select>
        </div>

        {rows.length > 0 ? (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              {rows.length} fila(s) válida(s){skipped > 0 ? ` · ${skipped} omitida(s)` : ""}. Vista
              previa:
            </div>
            <div
              style={{
                marginTop: 8,
                maxHeight: 240,
                overflow: "auto",
                border: "1px solid var(--line)",
                borderRadius: 10,
              }}
            >
              {rows.slice(0, 12).map((r, i) => (
                <div key={i} className="list-row" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {r.occurredOn.slice(5)}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.description || (r.kind === "ingreso" ? "Ingreso" : "Gasto")}
                  </span>
                  <span
                    className="tnum"
                    style={{
                      fontSize: 13,
                      color: r.kind === "ingreso" ? "var(--pos)" : "var(--neg)",
                    }}
                  >
                    {r.kind === "ingreso" ? "+" : "−"}
                    {formatMoney(r.amount, r.currency)}
                  </span>
                </div>
              ))}
              {rows.length > 12 ? (
                <div className="muted" style={{ padding: "8px 14px", fontSize: 12 }}>
                  … y {rows.length - 12} más
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={doImport}
          disabled={pending || rows.length === 0}
        >
          {pending ? "Importando…" : `Importar ${rows.length || ""}`}
        </button>
      </div>
    </Modal>
  );
}
