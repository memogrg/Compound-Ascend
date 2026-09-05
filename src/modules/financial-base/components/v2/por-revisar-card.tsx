"use client";

/**
 * Bandeja "Por revisar" — propuestas de ingesta detectadas desde los correos del
 * banco (ingest_proposals, status 'pending'). Calcada de ReconciliationCard:
 * colapsable, filas densas. Si no hay propuestas, no se renderiza. Solo UI: la
 * lógica vive en las server actions confirm/discardIngestProposalAction.
 *
 * La promesa del producto es «un clic, y si hay que corregir algo, ahí mismo».
 * Por eso cada fila trae el sobre a mano (es lo que más se ajusta) y un «Editar»
 * que despliega monto, moneda, fecha, comercio, nota y cuenta sin salir de la
 * bandeja. Confirmar sin tocar nada sigue siendo un solo clic.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import {
  confirmIngestProposalAction,
  discardIngestProposalAction,
  mergeIngestProposalAction,
  confirmIngestProposalsBatchAction,
  discardIngestProposalsBatchAction,
  type ProposalOverrides,
} from "@/modules/financial-base/api/v2-actions";
import {
  categoryMatchesKind,
  type SelectableCategory,
} from "@/modules/financial-base/engine/classify";
import type { Account } from "@/modules/financial-base/types";
import type { PendingProposalView } from "@/modules/financial-base/services/ingest-proposals-view";

const CURRENCIES = ["CRC", "USD"];

/** Borrador editable de una propuesta (strings: es lo que hay en los inputs). */
type Draft = {
  amount: string;
  currency: string;
  occurredOn: string;
  merchant: string;
  note: string;
  accountId: string;
};

function draftFrom(p: PendingProposalView): Draft {
  return {
    amount: String(p.amount),
    currency: p.currency,
    occurredOn: p.occurredOn,
    merchant: p.merchant ?? "",
    note: "",
    accountId: "",
  };
}

/** Solo lo que cambió respecto a la propuesta viaja como override. */
function diffOverrides(p: PendingProposalView, d: Draft, categoryId: string): ProposalOverrides {
  const ov: ProposalOverrides = {};
  const amount = Number(d.amount.replace(",", "."));
  if (Number.isFinite(amount) && amount > 0 && amount !== p.amount) ov.amount = amount;
  if (d.currency && d.currency !== p.currency) ov.currency = d.currency;
  if (d.occurredOn && d.occurredOn !== p.occurredOn) ov.occurredOn = d.occurredOn;
  if (d.merchant.trim() && d.merchant.trim() !== (p.merchant ?? ""))
    ov.merchant = d.merchant.trim();
  if (d.note.trim()) ov.note = d.note.trim();
  if (categoryId) ov.categoryId = categoryId;
  if (d.accountId) ov.accountId = d.accountId;
  return ov;
}

const HELP =
  "Movimientos detectados desde tus correos del banco. Confirmá para agregarlos a tus transacciones.";

export function PorRevisarCard({
  proposals,
  categories = [],
  accounts = [],
}: {
  proposals: PendingProposalView[];
  /** Sobres elegibles (hojas). Sin ellos, la fila no ofrece el selector. */
  categories?: SelectableCategory[];
  /** Cuentas del usuario, para corregir la cuenta antes de confirmar. */
  accounts?: Account[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ignorarDup, setIgnorarDup] = useState<Set<string>>(() => new Set());
  // Sobre elegido por fila (sin desplegar la edición) y borrador de edición abierto.
  const [sobre, setSobre] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Lote: filtro por fecha + selección múltiple. Para cargar un mes de historial
  // de un toque en vez de sesenta clics.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set());

  const visibleTodas = proposals.filter((p) => !hidden.has(p.id));
  const visible = visibleTodas.filter(
    (p) => (!desde || p.occurredOn >= desde) && (!hasta || p.occurredOn <= hasta),
  );
  if (visibleTodas.length === 0) return null;
  const seleccionadas = visible.filter((p) => sel.has(p.id));
  // «Todos» no incluye los posibles duplicados: esos se deciden uno por uno.
  const seleccionables = visible.filter((p) => !p.possibleDuplicate || ignorarDup.has(p.id));
  const todosMarcados = seleccionables.length > 0 && seleccionables.every((p) => sel.has(p.id));

  const lote = (
    action: (ids: string[]) => Promise<{ ok: boolean; hechas: number; fallidas: number }>,
    verbo: string,
  ) => {
    const ids = seleccionadas.map((p) => p.id);
    if (ids.length === 0) return;
    setBusy("__lote__");
    startTransition(async () => {
      const r = await action(ids);
      setBusy(null);
      if (r.hechas > 0) {
        setHidden((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          return next;
        });
        setSel(new Set());
        toast(
          `${r.hechas} ${r.hechas === 1 ? "movimiento" : "movimientos"} ${verbo}${r.fallidas ? ` · ${r.fallidas} no se pudieron` : ""}`,
        );
        router.refresh();
      } else {
        toast("No se pudo procesar la selección", "error");
      }
    });
  };

  const run = (
    id: string,
    action: (id: string) => Promise<{ ok: boolean; message?: string }>,
    okMsg: string,
  ) => {
    setBusy(id);
    startTransition(async () => {
      const res = await action(id);
      setBusy(null);
      if (res.ok) {
        toast(okMsg);
        setHidden((prev) => new Set(prev).add(id));
        setEditing(null);
        setDraft(null);
        router.refresh();
      } else {
        toast(res.message ?? "No se pudo procesar", "error");
      }
    });
  };

  /** Confirmar: con lo que haya (sobre de la fila + borrador si está abierto). */
  const confirmar = (p: PendingProposalView) => {
    const d = editing === p.id && draft ? draft : draftFrom(p);
    const ov = diffOverrides(p, d, sobre[p.id] ?? "");
    const hayCambios = Object.keys(ov).length > 0;
    run(
      p.id,
      (id) => confirmIngestProposalAction(id, hayCambios ? ov : undefined),
      hayCambios ? "Movimiento corregido y agregado" : "Movimiento agregado a tus transacciones",
    );
  };

  const abrirEdicion = (p: PendingProposalView) => {
    if (editing === p.id) {
      setEditing(null);
      setDraft(null);
    } else {
      setEditing(p.id);
      setDraft(draftFrom(p));
    }
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Resumen de una línea (toggle) + ayuda en tooltip. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "12px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 13,
          color: "var(--ink-2)",
        }}
      >
        <span
          className="chip"
          style={{
            background: "var(--warn-soft, rgba(190,140,40,.12))",
            color: "var(--warn)",
            fontSize: 10.5,
            flex: "none",
          }}
        >
          {visible.length}
        </span>
        <span style={{ fontWeight: 500 }}>
          Por revisar: {visible.length} {visible.length === 1 ? "movimiento" : "movimientos"} del
          banco
        </span>
        <span
          className="tip"
          data-tip={HELP}
          style={{ display: "inline-flex", color: "var(--muted)", flex: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="info" style={{ width: 14, height: 14 }} />
        </span>
        <span
          className="muted"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .15s",
          }}
        >
          <Icon name="chev" style={{ width: 14, height: 14 }} />
        </span>
      </button>

      {open ? (
        <div style={{ padding: "0 18px 12px", borderTop: "1px solid var(--line)" }}>
          {/* Barra de lote: fechas + seleccionar todos + registrar/descartar la selección. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              padding: "10px 0",
              borderBottom: "1px solid var(--line)",
              fontSize: 12,
            }}
          >
            <label
              className="muted"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <input
                type="checkbox"
                aria-label="Seleccionar todos los visibles"
                checked={todosMarcados}
                disabled={pending || seleccionables.length === 0}
                onChange={(e) =>
                  setSel(e.target.checked ? new Set(seleccionables.map((p) => p.id)) : new Set())
                }
              />
              Todos
            </label>
            <label
              className="muted"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              Del
              <input
                type="date"
                className="inp"
                style={{ fontSize: 11, padding: "3px 6px", width: "auto" }}
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </label>
            <label
              className="muted"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              al
              <input
                type="date"
                className="inp"
                style={{ fontSize: 11, padding: "3px 6px", width: "auto" }}
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </label>
            {desde || hasta ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => {
                  setDesde("");
                  setHasta("");
                }}
              >
                Quitar fechas
              </button>
            ) : null}
            <span className="muted" style={{ marginLeft: "auto" }}>
              {visible.length} de {visibleTodas.length}
              {seleccionadas.length ? ` · ${seleccionadas.length} seleccionados` : ""}
            </span>
            {seleccionadas.length > 0 ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: 11, padding: "4px 10px" }}
                  disabled={pending}
                  onClick={() => lote(confirmIngestProposalsBatchAction, "registrados")}
                >
                  {pending && busy === "__lote__" ? "…" : `Registrar ${seleccionadas.length}`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "4px 10px" }}
                  disabled={pending}
                  onClick={() => lote(discardIngestProposalsBatchAction, "descartados")}
                >
                  Descartar {seleccionadas.length}
                </button>
              </>
            ) : null}
          </div>
          {visible.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
              Nada entre esas fechas. Quitá el filtro para ver el resto.
            </p>
          ) : null}
          {visible.map((p) => {
            const rowBusy = pending && busy === p.id;
            const sobres = categories.filter((c) => categoryMatchesKind(c.categoryType, p.kind));
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--line)",
                  fontSize: 12.5,
                  opacity: rowBusy ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${p.merchant ?? "movimiento"}`}
                  checked={sel.has(p.id)}
                  disabled={rowBusy}
                  onChange={(e) =>
                    setSel((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                <span className="tnum" style={{ fontWeight: 600, flex: "none" }}>
                  {formatMoney(p.amount, p.currency)}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.merchant ?? (p.kind === "ingreso" ? "Ingreso" : "Gasto")}
                </span>
                {p.cardLabel ? (
                  <span className="chip" style={{ fontSize: 10, flex: "none" }}>
                    {p.cardLabel}
                  </span>
                ) : null}
                {p.confidence < 0.7 ? (
                  <span
                    className="chip tip"
                    data-tip="Confianza baja: verificá el monto antes de confirmar."
                    style={{
                      fontSize: 10,
                      flex: "none",
                      background: "var(--warn-soft, rgba(190,140,40,.12))",
                      color: "var(--warn)",
                    }}
                  >
                    verificar
                  </span>
                ) : null}
                <span className="muted" style={{ flex: "none" }}>
                  {p.occurredOn}
                </span>
                <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto", flex: "none" }}>
                  {sobres.length > 0 ? (
                    <select
                      className="sel"
                      aria-label="Sobre"
                      style={{ width: "auto", fontSize: 11, padding: "4px 8px" }}
                      value={sobre[p.id] ?? ""}
                      disabled={rowBusy}
                      onChange={(e) => setSobre((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    >
                      <option value="">Sobre…</option>
                      {sobres.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    disabled={rowBusy}
                    onClick={() => confirmar(p)}
                  >
                    {rowBusy ? "…" : "Confirmar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    disabled={rowBusy}
                    aria-expanded={editing === p.id}
                    onClick={() => abrirEdicion(p)}
                  >
                    {editing === p.id ? "Cerrar" : "Editar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    disabled={rowBusy}
                    onClick={() => run(p.id, discardIngestProposalAction, "Movimiento descartado")}
                  >
                    Descartar
                  </button>
                </span>

                {/* Conciliador: ya hay un movimiento que parece este (recibo, manual,
                    importado). Unir = una sola transacción con dos fuentes; no crea nada. */}
                {p.possibleDuplicate && !ignorarDup.has(p.id) ? (
                  <div
                    role="note"
                    style={{
                      flexBasis: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: 12,
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "var(--warn-soft, rgba(190,140,40,.12))",
                    }}
                  >
                    <span>
                      Parece el mismo que{" "}
                      <strong>
                        {p.possibleDuplicate.description} ·{" "}
                        {formatMoney(p.possibleDuplicate.amount, p.possibleDuplicate.currency)} ·{" "}
                        {p.possibleDuplicate.occurredOn}
                      </strong>{" "}
                      que ya registraste.
                    </span>
                    <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: "4px 10px" }}
                        disabled={rowBusy}
                        onClick={() =>
                          run(
                            p.id,
                            (id) =>
                              mergeIngestProposalAction(id, p.possibleDuplicate!.transactionId),
                            "Unido: un solo movimiento con la referencia del banco",
                          )
                        }
                      >
                        Sí, es el mismo
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: "4px 10px" }}
                        disabled={rowBusy}
                        onClick={() => setIgnorarDup((prev) => new Set(prev).add(p.id))}
                      >
                        No, es otro
                      </button>
                    </span>
                  </div>
                ) : null}

                {/* Edición en línea: corregir lo que el banco trajo mal, sin salir de acá. */}
                {editing === p.id && draft ? (
                  <div
                    style={{
                      flexBasis: "100%",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 8,
                      padding: "8px 0 4px",
                    }}
                  >
                    <label className="muted" style={{ display: "grid", gap: 3, fontSize: 11 }}>
                      Monto
                      <input
                        className="inp tnum"
                        inputMode="decimal"
                        value={draft.amount}
                        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                      />
                    </label>
                    <label className="muted" style={{ display: "grid", gap: 3, fontSize: 11 }}>
                      Moneda
                      <select
                        className="sel"
                        value={draft.currency}
                        onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                      >
                        {[...new Set([draft.currency, ...CURRENCIES])].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="muted" style={{ display: "grid", gap: 3, fontSize: 11 }}>
                      Fecha
                      <input
                        className="inp"
                        type="date"
                        value={draft.occurredOn}
                        onChange={(e) => setDraft({ ...draft, occurredOn: e.target.value })}
                      />
                    </label>
                    <label className="muted" style={{ display: "grid", gap: 3, fontSize: 11 }}>
                      Comercio
                      <input
                        className="inp"
                        value={draft.merchant}
                        maxLength={160}
                        onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
                      />
                    </label>
                    <label className="muted" style={{ display: "grid", gap: 3, fontSize: 11 }}>
                      Nota
                      <input
                        className="inp"
                        value={draft.note}
                        maxLength={280}
                        placeholder="Opcional"
                        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                      />
                    </label>
                    {accounts.length > 0 ? (
                      <label className="muted" style={{ display: "grid", gap: 3, fontSize: 11 }}>
                        Cuenta
                        <select
                          className="sel"
                          value={draft.accountId}
                          onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
                        >
                          <option value="">Predeterminada</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
