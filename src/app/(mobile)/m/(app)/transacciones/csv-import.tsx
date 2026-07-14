"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/lib/format";
import { importTransactionsAction } from "@/modules/financial-base/api/v2-actions";
import { parseCsv, type ParsedCsvRow } from "@/modules/financial-base/engine/csv-parse";

import { BottomSheet, SheetSelect, CUR_OPTS, useToast } from "../../components/form-kit";

/**
 * Importar movimientos por CSV en /m/transacciones — usa el MISMO parser puro que la web
 * (engine/csv-parse) y la MISMA Server Action (importTransactionsAction): cero backend nuevo.
 *
 * Las filas importadas entran como `pending_review` + `origin='imported'` y sin sobre, así que
 * aparecen en la bandeja "Por ordenar" (por revisar y por clasificar) — la copia se lo dice al
 * usuario en vez de dejarlo adivinando.
 */
const PREVIEW = 5;

/** Columnas que el parser reconoce (para el mensaje de error). */
const EXPECTED = "fecha, monto y, si las tienes, tipo (ingreso/gasto), descripción y moneda";

export function CsvImport({ currency }: { currency: string }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  // Moneda de las filas que NO traen columna de moneda.
  const [fallback, setFallback] = useState(currency);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFileName("");
    setRawText("");
    setRows([]);
    setSkipped(0);
    setError(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const applyParse = (text: string, cur: string) => {
    const res = parseCsv(text, cur);
    setRows(res.rows);
    setSkipped(res.skipped);
    if (res.rows.length === 0) {
      setError(
        `No encontré movimientos en el archivo. Revisa que la primera fila tenga los nombres de las columnas: ${EXPECTED}.`,
      );
    } else {
      setError(null);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      setRawText(text);
      applyParse(text, fallback);
    } catch {
      setRawText("");
      setRows([]);
      setSkipped(0);
      setError("No pudimos leer el archivo. Asegúrate de que sea un CSV.");
    }
  };

  const changeFallback = (code: string) => {
    setFallback(code);
    // Re-parsea: las filas sin moneda adoptan la nueva por defecto.
    if (rawText) applyParse(rawText, code);
  };

  const doImport = () => {
    startTransition(async () => {
      const res = await importTransactionsAction(rows);
      if (res.ok) {
        const extra = res.skipped > 0 ? ` · ${res.skipped} omitidos` : "";
        toast.show(`Importados ${res.count}${extra}`, "success");
        close();
        router.refresh();
      } else {
        toast.show(res.message ?? "No pudimos importar", "error");
      }
    });
  };

  return (
    <>
      <div className="card card-p" style={{ marginBottom: 14 }}>
        <div className="between">
          <div style={{ minWidth: 0 }}>
            <div className="sec-title">Importar CSV</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
              Sube el estado de cuenta de tu banco y registra todo de una vez.
            </div>
          </div>
          <button
            type="button"
            className="m-btn m-btn-secondary"
            style={{ flexShrink: 0, marginLeft: 12 }}
            onClick={() => setOpen(true)}
          >
            Subir
          </button>
        </div>
      </div>

      <BottomSheet open={open} onClose={close} title="Importar CSV">
        <div style={{ display: "grid", gap: 10 }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Columnas que leemos: {EXPECTED}. Si no hay columna de tipo, un monto negativo se toma
            como gasto.
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={onFile}
            aria-hidden
            tabIndex={-1}
          />
          <button
            type="button"
            className="m-btn m-btn-block m-btn-secondary"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
          >
            {fileName || "Elegir archivo CSV"}
          </button>

          <SheetSelect
            name="fallbackCurrency"
            label="Moneda por defecto"
            value={fallback}
            options={CUR_OPTS}
            sheetTitle="Moneda por defecto"
            onChange={changeFallback}
          />
          <div className="muted" style={{ fontSize: 11.5, marginTop: -4, lineHeight: 1.45 }}>
            Se aplica solo a las filas que no traen su propia moneda.
          </div>

          {error ? (
            <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {error}
            </div>
          ) : null}

          {rows.length > 0 ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Encontré {rows.length} {rows.length === 1 ? "movimiento" : "movimientos"}
                {skipped > 0 ? ` (${skipped} ${skipped === 1 ? "omitido" : "omitidos"})` : ""}
              </div>

              <div className="card" style={{ padding: 0 }}>
                {rows.slice(0, PREVIEW).map((r, i) => (
                  <div
                    key={i}
                    className="between"
                    style={{ padding: "10px 12px", gap: 10, alignItems: "flex-start" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.description || (r.kind === "ingreso" ? "Ingreso" : "Gasto")}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {r.occurredOn} · {r.kind === "ingreso" ? "Ingreso" : "Gasto"}
                      </div>
                    </div>
                    <div
                      className={`mono ${r.kind === "ingreso" ? "pos" : "neg"}`}
                      style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}
                    >
                      {r.kind === "ingreso" ? "+" : "−"}
                      {formatMoney(r.amount, r.currency)}
                    </div>
                  </div>
                ))}
                {rows.length > PREVIEW ? (
                  <div className="muted" style={{ padding: "8px 12px", fontSize: 11.5 }}>
                    … y {rows.length - PREVIEW} más
                  </div>
                ) : null}
              </div>

              <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                Entran como pendientes de revisar y sin sobre: los verás arriba, en «Por ordenar»,
                para clasificarlos y conciliarlos.
              </div>

              <button
                type="button"
                className="m-btn m-btn-block m-btn-primary"
                disabled={pending}
                onClick={doImport}
              >
                {pending
                  ? "Importando…"
                  : `Importar ${rows.length} ${rows.length === 1 ? "movimiento" : "movimientos"}`}
              </button>
            </>
          ) : null}

          <button
            type="button"
            className="m-btn m-btn-block m-btn-secondary"
            disabled={pending}
            onClick={close}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
