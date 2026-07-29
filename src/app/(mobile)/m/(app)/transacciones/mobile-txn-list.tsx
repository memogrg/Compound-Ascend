"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  addTransactionAction,
  editTransactionAction,
  removeTransactionAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Transaction, Account } from "@/modules/financial-base/types";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { SelectableCategory } from "@/modules/financial-base/engine/classify";
import {
  describeMoneyFlow,
  FLOW_VERB_LABEL,
  LIQUIDITY_LABEL,
  type MoneyFlow,
  type MoneyFlowEffect,
} from "@/modules/financial-base/engine/money-flow";
import { formatMoney } from "@/lib/format";

import { Fab, BottomSheet, SwipeRow, ConfirmDialog, useToast } from "../../components/form-kit";
import type { MIconName } from "../../components/m-icon";
import {
  MContentCard,
  MSectionHeader,
  MDataRow,
  MEmptyState,
  mAmount,
} from "../../components/content-kit";
import { TxnForm, type TxnFormValues } from "./txn-form";
import { TxnActionsSheet } from "./txn-actions";

/**
 * Gestión de transacciones en /m/transacciones — reutiliza las Server Actions V2 de la web
 * (add/edit/removeTransactionAction). Filtro por tipo + cada movimiento gestionable en un
 * SwipeRow (Editar/Eliminar) y, al tocarlo, un sheet con el resto de acciones de la web
 * (duplicar, dividir, reasignar sobre, ver recibo, marcar revisada). FAB → registrar
 * ingreso/gasto manual.
 *
 * Vinculadas (linkedKind≠none: pagos de deuda, aportes, dividendos, renta): NO se editan/
 * borran aquí porque removeTransaction sólo borra la fila de transactions y dejaría huérfano
 * el registro de origen (p.ej. el debt_payment). En su lugar se enlaza a la pantalla de
 * origen, que tiene el flujo correcto (revierte el ledger). Igual criterio para
 * transferencias/ajustes (se crean/editan en su propio flujo). Por eso el sheet de acciones
 * solo cuelga de las filas gestionables: así "Dividir" (que reemplaza el movimiento por N
 * partes nuevas) nunca puede romper el vínculo transacción↔entidad.
 */

const KIND_LABEL: Record<Transaction["kind"], string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

const LINKED_ORIGIN: Record<string, { href: string; label: string }> = {
  debt: { href: "/m/deudas", label: "Deudas" },
  goal: { href: "/m/metas", label: "Ahorro" },
  holding: { href: "/m/patrimonio", label: "Patrimonio" },
  policy: { href: "/m/proteccion", label: "Protección" },
  rental: { href: "/m/patrimonio", label: "Patrimonio" },
};

/** Glifo por origen de una vinculada: dice de un vistazo de dónde viene el movimiento. */
const LINKED_ICON: Record<string, MIconName> = {
  debt: "debt",
  goal: "goal",
  holding: "investment",
  policy: "protection",
  rental: "rental",
};

/** Glifo de un movimiento suelto: entra (moneda), sale (carrito) o se mueve (transferencia). */
function txnIcon(t: Transaction): MIconName {
  if (t.linkedKind && t.linkedKind !== "none") return LINKED_ICON[t.linkedKind] ?? "transfer";
  if (t.kind === "ingreso") return "income";
  if (t.kind === "gasto") return "food";
  return "transfer";
}

function isLinked(t: Transaction): boolean {
  return Boolean(t.linkedKind) && t.linkedKind !== "none";
}

/** Gestionable en esta pantalla: ingreso/gasto manual no vinculado. */
function isManageable(t: Transaction): boolean {
  return !isLinked(t) && (t.kind === "ingreso" || t.kind === "gasto");
}

type Filter = "all" | "ingreso" | "gasto";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "ingreso", label: "Ingresos" },
  { key: "gasto", label: "Gastos" },
];

/** Tono del importe por efecto en liquidez: sale rojo, entra verde, neutro gris. */
function effectTone(effect: MoneyFlowEffect): "success" | "danger" | "neutral" {
  return effect === "in" ? "success" : effect === "out" ? "danger" : "neutral";
}
/** Color CSS (tema-aware) del efecto para la línea de viaje y el detalle. */
function effectColorVar(effect: MoneyFlowEffect): string {
  return effect === "out" ? "var(--danger)" : effect === "in" ? "var(--accent)" : "var(--text-dim)";
}
function effectSign(effect: MoneyFlowEffect): string {
  return effect === "in" ? "+" : effect === "out" ? "−" : "";
}

/** Línea de viaje "origen → destino": colorea "Tu liquidez" según el efecto. */
function MobileTravelLine({ flow }: { flow: MoneyFlow }) {
  if (flow.isJarSpend) return <>Sale del frasco · no toca tu liquidez</>;
  const color = effectColorVar(flow.effect);
  const token = (label: string) =>
    label === LIQUIDITY_LABEL ? (
      <strong style={{ color, fontWeight: 600 }}>{label}</strong>
    ) : (
      <span>{label}</span>
    );
  return (
    <>
      {token(flow.fromLabel)}
      <span style={{ color: "var(--text-dim)" }}> → </span>
      {token(flow.toLabel)}
    </>
  );
}

export function MobileTxnList({
  transactions,
  categoryNames,
  categories,
  currency,
  periodLabel,
  jars,
  accounts,
  incomeCats,
  incomeGroupId,
  balanceAfter,
}: {
  transactions: Transaction[];
  categoryNames: Record<string, string>;
  categories: SelectableCategory[];
  currency: string;
  periodLabel: string;
  jars: Jar[];
  accounts: Account[];
  /** Categorías de ingreso (obligatorias en el registro manual de ingreso). */
  incomeCats: { id: string; name: string }[];
  /** Grupo de ingresos para crear una categoría al vuelo. */
  incomeGroupId: string | null;
  /** Saldo de liquidez tras cada txn que movió el saco (por id). Fase B. */
  balanceAfter?: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [delPending, setDelPending] = useState(false);
  const [actionsFor, setActionsFor] = useState<Transaction | null>(null);
  // Fase B: una fila abierta a la vez (tocar la fila despliega su detalle del viaje).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpand = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  const list = filter === "all" ? transactions : transactions.filter((t) => t.kind === filter);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await removeTransactionAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Transacción eliminada", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar.", "error");
    }
  };

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

      <MSectionHeader
        title={filter === "all" ? "Todas las transacciones" : filter === "ingreso" ? "Ingresos" : "Gastos"}
        action={
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {list.length} · {periodLabel}
          </span>
        }
      />

      {list.length === 0 ? (
        <MEmptyState
          icon="transfer"
          title={filter === "all" ? "Nada este periodo" : "Nada con este filtro"}
          description={
            filter === "all"
              ? "Cuando registres un gasto o un ingreso aparecerá aquí, listo para clasificar."
              : "Prueba con otro filtro o registra un movimiento nuevo."
          }
          actionLabel="Registrar movimiento"
          onAction={() => setAdding(true)}
        />
      ) : (
        // padding 0: la fila va a sangre para que el gesto revele Editar/Eliminar; el aire
        // lateral lo pone la regla puente .m-swipe-content .m-drow.
        <MContentCard style={{ padding: 0, overflow: "hidden" }}>
          {list.map((t) => {
            const linked = isLinked(t);
            const origin = linked && t.linkedKind ? LINKED_ORIGIN[t.linkedKind] : undefined;
            // El viaje del dinero (Fase B): efecto en liquidez, origen y destino. Puro.
            const flow = describeMoneyFlow(t);
            const expanded = expandedId === t.id;
            const row = <TxnRow t={t} flow={flow} currency={currency} />;
            const detail = expanded ? (
              <TxnDetail
                t={t}
                flow={flow}
                currency={currency}
                categoryNames={categoryNames}
                balanceAfter={balanceAfter?.[t.id]}
                origin={origin}
                // El sheet de acciones (duplicar/dividir/…) sólo cuelga de las gestionables.
                onMore={isManageable(t) ? () => setActionsFor(t) : undefined}
              />
            ) : null;

            // Gestionable (ingreso/gasto suelto): swipe editar/eliminar + tap→detalle.
            if (isManageable(t)) {
              return (
                <div key={t.id}>
                  <SwipeRow
                    onEdit={() => setEditing(t)}
                    onDelete={() => setDeleting(t)}
                    onTap={() => toggleExpand(t.id)}
                  >
                    {row}
                  </SwipeRow>
                  {detail}
                </div>
              );
            }
            // Vinculada / transferencia / ajuste: tap→detalle (el "Ver en X" del detalle navega).
            return (
              <div key={t.id}>
                <button
                  type="button"
                  className="m-row-wrap"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: 0,
                    padding: 0,
                    color: "inherit",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                  aria-expanded={expanded}
                  onClick={() => toggleExpand(t.id)}
                >
                  {row}
                </button>
                {detail}
              </div>
            );
          })}
        </MContentCard>
      )}

      <Fab onClick={() => setAdding(true)} label="Registrar transacción" />

      {/* Acciones del movimiento (toque en la fila): duplicar, dividir, reasignar, recibo, revisar */}
      <TxnActionsSheet
        txn={actionsFor}
        categories={categories}
        categoryNames={categoryNames}
        onClose={() => setActionsFor(null)}
        onEdit={(t) => setEditing(t)}
        onDelete={(t) => setDeleting(t)}
      />

      {/* Crear */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Registrar transacción">
        <TxnForm
          jars={jars}
          currency={currency}
          accounts={accounts}
          incomeCats={incomeCats}
          incomeGroupId={incomeGroupId}
          action={addTransactionAction}
          submitLabel="Registrar"
          successMessage="Transacción registrada"
          onSuccess={() => setAdding(false)}
        />
      </BottomSheet>

      {/* Editar (tipo fijo, como la web) */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar transacción">
        {editing ? (
          <TxnForm
            initial={editing}
            lockKind
            jars={jars}
            currency={currency}
            accounts={accounts}
            incomeCats={incomeCats}
            incomeGroupId={incomeGroupId}
            action={(v: TxnFormValues) => editTransactionAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Transacción actualizada"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Eliminar */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar transacción"
        message={
          deleting
            ? `Se eliminará ${deleting.kind === "ingreso" ? "el ingreso" : "el gasto"} de ${formatMoney(Math.abs(deleting.amount), deleting.currency || currency)}.`
            : undefined
        }
        confirmLabel="Eliminar"
        variant="danger"
        pending={delPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/**
 * Fila de transacción (contenido reutilizado por SwipeRow / Link / read-only).
 *
 * Las VINCULADAS (via ≠ undefined) llevan chevron: es la afordancia de "esto te lleva a su
 * origen" — no se editan en crudo aquí. El destino lo dice su glifo (tarjeta → Deudas, diana
 * → Ahorro…) y el aria-label; el "· vía X" que iba en el subtítulo era la tercera vez que se
 * decía lo mismo y dejaba el subtítulo a 1px de cortarse a 375px. Las gestionables no llevan
 * chevron: se tocan para abrir sus acciones y se deslizan para editar.
 */
function TxnRow({
  t,
  flow,
  currency,
}: {
  t: Transaction;
  flow: MoneyFlow;
  currency: string;
}) {
  const name = t.merchantOrSource || t.description || KIND_LABEL[t.kind];
  const amount = `${effectSign(flow.effect)}${mAmount(Math.abs(t.amount), t.currency || currency, 10)}`;
  return (
    <MDataRow
      icon={txnIcon(t)}
      iconTone={flow.effect === "in" ? "success" : "neutral"}
      title={name}
      // La línea de viaje "origen → destino" reemplaza "día · categoría" (Fase B): la
      // historia del dinero manda; la fecha vive en el detalle expandible.
      subtitle={<MobileTravelLine flow={flow} />}
      // Color del monto por efecto en liquidez. El neutro (frasco/transferencia) va gris
      // explícito: el tono neutral hereda el color del texto, no gris, y aquí sí queremos
      // leer "no toca tu cash". Signo delante del símbolo (formatMoney antepone ₡).
      value={
        flow.effect === "neutral" ? (
          <span style={{ color: "var(--text-dim)" }}>{amount}</span>
        ) : (
          amount
        )
      }
      valueTone={effectTone(flow.effect)}
    />
  );
}

/** Una fila etiqueta/valor del detalle expandido. */
function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ textAlign: "right", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/**
 * Detalle del viaje del dinero al expandir una fila (Fase B): de dónde salió, a dónde
 * llega/se almacena, su efecto en liquidez y el saldo tras el movimiento. El "Ver en X"
 * navega a la pantalla de origen; "Más acciones" abre el sheet (sólo gestionables).
 */
function TxnDetail({
  t,
  flow,
  currency,
  categoryNames,
  balanceAfter,
  origin,
  onMore,
}: {
  t: Transaction;
  flow: MoneyFlow;
  currency: string;
  categoryNames: Record<string, string>;
  balanceAfter?: number;
  origin?: { href: string; label: string };
  onMore?: () => void;
}) {
  const color = effectColorVar(flow.effect);
  const money = formatMoney(Math.abs(t.amount), t.currency || currency);
  const cat = (t.categoryId ? categoryNames[t.categoryId] : "") || KIND_LABEL[t.kind];
  const efecto =
    flow.effect === "out"
      ? `− ${money} · sale de tu liquidez`
      : flow.effect === "in"
        ? `+ ${money} · entra a tu liquidez`
        : "No toca tu liquidez";
  const fullDate = new Date(`${t.occurredOn}T00:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div
      style={{
        padding: "10px 16px 14px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        fontSize: 12.5,
      }}
    >
      <DetailRow label="Fecha" value={fullDate} />
      {flow.isJarSpend ? (
        <>
          <DetailRow label="Salió del frasco" value={<span style={{ color }}>{flow.fromLabel}</span>} />
          <DetailRow label="Pagado con" value={cat} />
        </>
      ) : (
        <>
          <DetailRow
            label="Salió de"
            value={
              <span style={flow.fromLabel === LIQUIDITY_LABEL ? { color } : undefined}>
                {flow.fromLabel}
              </span>
            }
          />
          <DetailRow
            label={FLOW_VERB_LABEL[flow.verb]}
            value={
              <span style={flow.toLabel === LIQUIDITY_LABEL ? { color } : undefined}>
                {flow.toLabel || "—"}
              </span>
            }
          />
        </>
      )}
      <DetailRow label="Efecto en tu liquidez" value={<span style={{ color }}>{efecto}</span>} />
      <DetailRow
        label="Liquidez después"
        value={balanceAfter != null ? formatMoney(balanceAfter, currency) : "No cambia"}
      />
      {origin || onMore ? (
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          {origin ? (
            <Link href={origin.href} className="m-btn m-btn-secondary" style={{ fontSize: 12.5 }}>
              Ver en {origin.label} →
            </Link>
          ) : null}
          {onMore ? (
            <button
              type="button"
              className="m-btn m-btn-secondary"
              style={{ fontSize: 12.5 }}
              onClick={onMore}
            >
              Más acciones
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
