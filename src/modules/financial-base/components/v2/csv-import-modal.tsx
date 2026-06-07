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
import { formatMoney } from "@/lib/format";
import { importTransactionsAction } from "@/modules/financial-base/api/v2-actions";

type Parsed = { kind: "ingreso" | "gasto"; amount: number; occurredOn: string; description?: string; currency: string };

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === ",") { out.push(cur); cur = ""; }
    else if (c === '"') q = true;
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

function parseCsv(text: string, defaultCurrency: string): { rows: Parsed[]; skipped: number } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], skipped: 0 };
  const header = splitLine(lines[0]!).map(norm);
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = idx(["fecha", "date"]);
  const iDesc = idx(["descripcion", "comercio", "concepto", "detalle", "description", "merchant"]);
  const iAmt = idx(["monto", "amount", "importe", "valor"]);
  const iKind = idx(["tipo", "kind"]);
  const iCur = idx(["moneda", "currency"]);

  const rows: Parsed[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!);
    const rawAmt = (iAmt >= 0 ? cells[iAmt] : "") ?? "";
    const num = Number(rawAmt.replace(/[^0-9.\-]/g, ""));
    const date = iDate >= 0 ? normalizeDate(cells[iDate] ?? "") : null;
    if (!Number.isFinite(num) || num === 0 || !date) { skipped++; continue; }
    let kind: "ingreso" | "gasto";
    const kindCell = iKind >= 0 ? norm(cells[iKind] ?? "") : "";
    if (kindCell.includes("ingres") || kindCell.includes("income")) kind = "ingreso";
    else if (kindCell.includes("gast") || kindCell.includes("expense")) kind = "gasto";
    else kind = num < 0 ? "gasto" : "ingreso";
    rows.push({
      kind,
      amount: Math.abs(num),
      occurredOn: date,
      description: iDesc >= 0 ? (cells[iDesc] || undefined) : undefined,
      currency: (iCur >= 0 ? cells[iCur]?.toUpperCase().slice(0, 3) : "") || defaultCurrency,
    });
  }
  return { rows, skipped };
}

export function CsvImportButton({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost" style={{ border: "1px solid var(--line)" }} onClick={() => setOpen(true)}>
        <Icon name="upload" width={2} /> Importar CSV
      </button>
      {open ? <CsvImportModal currency={currency} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CsvImportModal({ currency, onClose }: { currency: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Parsed[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pending, startTransition] = useTransition();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const res = parseCsv(text, currency);
    setRows(res.rows);
    setSkipped(res.skipped);
    if (res.rows.length === 0) toast("No encontré filas válidas. Revisa las columnas.", "error");
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
    <Modal title="Importar CSV" sub="Columnas: fecha, descripción, monto, tipo (ingreso/gasto), moneda." onClose={onClose}>
      <div className="modal-body">
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" width={2} /> {fileName || "Elegir archivo CSV"}
        </button>

        {rows.length > 0 ? (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              {rows.length} fila(s) válida(s){skipped > 0 ? ` · ${skipped} omitida(s)` : ""}. Vista previa:
            </div>
            <div style={{ marginTop: 8, maxHeight: 240, overflow: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
              {rows.slice(0, 12).map((r, i) => (
                <div key={i} className="list-row" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.occurredOn.slice(5)}</span>
                  <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description || (r.kind === "ingreso" ? "Ingreso" : "Gasto")}</span>
                  <span className="tnum" style={{ fontSize: 13, color: r.kind === "ingreso" ? "var(--pos)" : "var(--neg)" }}>
                    {r.kind === "ingreso" ? "+" : "−"}{formatMoney(r.amount, r.currency)}
                  </span>
                </div>
              ))}
              {rows.length > 12 ? <div className="muted" style={{ padding: "8px 14px", fontSize: 12 }}>… y {rows.length - 12} más</div> : null}
            </div>
          </>
        ) : null}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={doImport} disabled={pending || rows.length === 0}>
          {pending ? "Importando…" : `Importar ${rows.length || ""}`}
        </button>
      </div>
    </Modal>
  );
}
