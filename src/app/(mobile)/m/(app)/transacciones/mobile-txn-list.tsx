"use client";

import { useState } from "react";

import type { Transaction } from "@/modules/financial-base";
import { formatMoney } from "@/lib/format";

/**
 * Lista de transacciones del móvil con filtro por tipo (Todas/Ingresos/Gastos).
 * Recibe las transacciones ya cargadas por el servidor (loadBaseView) — no reimplementa
 * ninguna consulta. Espeja el layout de fila de "Movimientos recientes" del Inicio.
 */

const KIND_LABEL: Record<Transaction["kind"], string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

/** Fecha relativa (Hoy / Ayer / día / d mes), como en el Inicio. */
function relativeDay(iso: string): string {
  const now = new Date();
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff <= 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff < 7) return d.toLocaleDateString("es-MX", { weekday: "short" });
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

type Filter = "all" | "ingreso" | "gasto";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "ingreso", label: "Ingresos" },
  { key: "gasto", label: "Gastos" },
];

export function MobileTxnList({
  transactions,
  categoryNames,
  currency,
  periodLabel,
}: {
  transactions: Transaction[];
  categoryNames: Record<string, string>;
  currency: string;
  periodLabel: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const list = filter === "all" ? transactions : transactions.filter((t) => t.kind === filter);

  return (
    <>
      <div className="m-chips" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`m-chip${filter === f.key ? " sel" : ""}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card card-p">
        <div className="between" style={{ marginBottom: 8 }}>
          <div className="ov">Todas las transacciones</div>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {list.length} · {periodLabel}
          </span>
        </div>

        {list.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: "12px 0" }}>
            No hay movimientos en este periodo.
          </div>
        ) : (
          list.map((t) => {
            const income = t.kind === "ingreso";
            const sign = income ? "+" : t.kind === "gasto" ? "−" : "";
            const name = t.merchantOrSource || t.description || KIND_LABEL[t.kind];
            const cat = (t.categoryId ? categoryNames[t.categoryId] : "") || KIND_LABEL[t.kind];
            return (
              <div className="lrow" key={t.id}>
                <span
                  className="lic"
                  style={income ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
                  aria-hidden
                >
                  {income ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
                      <path d="M6 6 5 3H3M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="lname">{name}</div>
                  <div className="lsub">
                    {cat} · {relativeDay(t.occurredOn)}
                  </div>
                </div>
                <div className={`lamt ${income ? "pos" : ""}`}>
                  {sign}
                  {formatMoney(Math.abs(t.amount), t.currency || currency)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
