"use client";

/**
 * Modal del frasco "Por reasignar": las líneas de presupuesto que SUMAN en el
 * titular "Gasto planificado" pero cuya categoría ya no se pinta en ningún
 * frasco (se ocultó, se desactivó, se borró, o la línea nunca tuvo categoría).
 *
 * Existe para que el total siempre cuadre con lo visible. Reasignar una línea
 * NO cambia el titular: la línea ya sumaba, solo pasa a verse donde corresponde.
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import {
  reassignBudgetItemAction,
  removeBudgetItemAction,
  assignCategoryAction,
  removeTransactionAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Jar, OrphanLine, OrphanReason } from "@/modules/financial-base/engine/expense-jars";
import {
  buildCategoryOptionGroups,
  type CategoryOptionGroup,
} from "@/modules/financial-base/engine/category-options";
import type { Category } from "@/modules/financial-base/services/categories-service";

/** Etiqueta del chip por motivo. El engine solo emite los que puede probar. */
const REASON_LABEL: Record<OrphanReason, string> = {
  sin_categoria: "Sin categoría",
  categoria_oculta: "Categoría oculta",
  categoria_inactiva: "Categoría inactiva",
  categoria_inexistente: "Categoría borrada",
  no_renderizada: "Fuera de los frascos",
};

const TIP_BUDGET =
  "Estas líneas suman en tu presupuesto pero su categoría ya no se muestra " +
  "(se ocultó o se borró). Reasignalas para que vuelvan a su frasco.";

const TIP_REAL =
  "Estos gastos ya ocurrieron y suman en «Gastado», pero su categoría ya no se " +
  "muestra. Recategorizalos para que vuelvan a su frasco.";

/** Cómo se llama el ledger que revierte un borrado, por tipo de vínculo. */
const LINKED_NOUN: Record<string, string> = {
  goal: "el acumulado de tu sobre",
  debt: "el saldo de tu deuda",
  holding: "el costo de tu inversión",
  policy: "tu póliza",
  rental: "tu renta",
};

/** ¿La transacción está vinculada a una entidad cuyo ledger se revierte al borrar? */
function isLinked(line: OrphanLine): boolean {
  return Boolean(line.linkedKind && line.linkedKind !== "none");
}

/** Mensaje de confirmación: diferenciado si borrar revierte un ledger vinculado. */
function deletionWarning(line: OrphanLine, currency: string): string {
  const amount = formatMoney(line.amount, currency);
  if (!isLinked(line)) {
    return `Se eliminará el gasto «${line.name}» (${amount}). Tu total gastado baja por ese monto.`;
  }
  const noun = LINKED_NOUN[line.linkedKind!] ?? "la entidad vinculada";
  const target = line.linkedName ? `${noun} «${line.linkedName}»` : `${noun}`;
  // El reverso de reverseLinkedTransaction: borrar el gasto le devuelve el monto
  // a la entidad. Ej. un aporte a un sobre → le RESTA al acumulado del sobre.
  return (
    `Este gasto está vinculado: borrarlo REVERTIRÁ su efecto en ${target}. ` +
    `Se le restará ${amount}. Esta acción no se puede deshacer.`
  );
}

/**
 * Transacción de gasto sin frasco. Se puede RECATEGORIZAR (assignCategoryAction,
 * la misma acción del tab de Transacciones) o ELIMINAR (removeTransactionAction,
 * que ya revierte el ledger vinculado y registra el borrado en el log del hogar).
 * El borrado exige confirmación, con aviso reforzado si es una transacción
 * vinculada — si no, se perdería plata del frasco sin saberlo.
 */
function RealOrphanRow({
  line,
  currency,
  cats,
  onDone,
}: {
  line: OrphanLine;
  currency: string;
  cats: CategoryOptionGroup[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const recategorize = async () => {
    if (!categoryId) return setError("Elegí una categoría de destino.");
    setPending(true);
    setError(null);
    const res = await assignCategoryAction({ transactionId: line.id, categoryId });
    setPending(false);
    if (res.ok) {
      toast("Gasto recategorizado · tu total gastado no cambia");
      onDone();
    } else {
      setError(res.message ?? "No pudimos recategorizar el gasto.");
    }
  };

  const remove = async () => {
    setPending(true);
    setError(null);
    const res = await removeTransactionAction(line.id);
    setPending(false);
    if (res.ok) {
      toast(
        isLinked(line)
          ? "Gasto eliminado · se revirtió el efecto en la entidad vinculada"
          : "Gasto eliminado · tu total gastado bajó por ese monto",
      );
      onDone();
    } else {
      setConfirming(false);
      setError(res.message ?? "No pudimos eliminar el gasto.");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="env-name">{line.name}</div>
          <span className="chip-linked">{REASON_LABEL[line.reason]}</span>
          {isLinked(line) ? <span className="chip-linked">vinculado</span> : null}
        </div>
        <div className="big" style={{ whiteSpace: "nowrap" }}>
          {formatMoney(line.amount, currency)}
        </div>
      </div>

      {confirming ? (
        /* Confirmación OBLIGATORIA: aviso reforzado si es vinculada. */
        <div className="auth-msg warn" role="alertdialog" aria-label="Confirmar eliminación">
          <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
            {deletionWarning(line, currency)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "5px 10px" }}
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              style={{ fontSize: 12, padding: "5px 10px" }}
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending ? "Eliminando…" : "Sí, eliminar"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="sel"
            style={{ flex: 1, minWidth: 160 }}
            value={categoryId}
            disabled={pending}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label={`Recategorizar ${line.name} a…`}
          >
            <option value="">Recategorizar a…</option>
            {cats.map((g) => (
              <optgroup key={g.groupName} label={g.groupName}>
                {g.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: 12, padding: "5px 10px" }}
            disabled={pending || !categoryId}
            onClick={() => void recategorize()}
          >
            Recategorizar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "5px 10px" }}
            disabled={pending}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            Eliminar
          </button>
        </div>
      )}

      {error ? (
        <div className="auth-msg warn" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function OrphanRow({
  line,
  currency,
  cats,
  onDone,
}: {
  line: OrphanLine;
  currency: string;
  cats: CategoryOptionGroup[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reassign = async () => {
    if (!categoryId) return setError("Elegí una categoría de destino.");
    setPending(true);
    setError(null);
    const res = await reassignBudgetItemAction({ budgetItemId: line.id, categoryId });
    setPending(false);
    if (res.ok) {
      toast("Línea reasignada · tu presupuesto total no cambia");
      onDone();
    } else {
      setError(res.message ?? "No pudimos reasignar la línea.");
    }
  };

  const remove = async () => {
    setPending(true);
    setError(null);
    const res = await removeBudgetItemAction(line.id);
    setPending(false);
    if (res.ok) {
      toast("Línea eliminada del presupuesto");
      onDone();
    } else {
      setError(res.message ?? "No pudimos eliminar la línea.");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="env-name">{line.name}</div>
          <span className="chip-linked">{REASON_LABEL[line.reason]}</span>
        </div>
        <div className="big" style={{ whiteSpace: "nowrap" }}>
          {formatMoney(line.amount, currency)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="sel"
          style={{ flex: 1, minWidth: 160 }}
          value={categoryId}
          disabled={pending}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label={`Reasignar ${line.name} a…`}
        >
          <option value="">Reasignar a…</option>
          {cats.map((g) => (
            <optgroup key={g.groupName} label={g.groupName}>
              {g.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: 12, padding: "5px 10px" }}
          disabled={pending || !categoryId}
          onClick={() => void reassign()}
        >
          Reasignar
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: "5px 10px" }}
          disabled={pending}
          onClick={() => void remove()}
        >
          Eliminar línea
        </button>
      </div>

      {error ? (
        <div className="auth-msg warn" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function JarOrphansModal({
  jar,
  currency,
  categories,
  onClose,
}: {
  jar: Extract<Jar, { kind: "orphan" }>;
  currency: string;
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const cats = useMemo(() => buildCategoryOptionGroups(categories), [categories]);
  const onDone = useCallback(() => router.refresh(), [router]);

  return (
    <Modal
      title={jar.name}
      // Los dos totales van por separado: son cosas distintas (lo que planeaste
      // vs lo que ya gastaste) y sumarlos daría un número que no existe.
      sub={[
        jar.items.length > 0 ? `${formatMoney(jar.total, currency)} planificado` : null,
        jar.realItems.length > 0 ? `${formatMoney(jar.realTotal, currency)} gastado` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      onClose={onClose}
    >
      <div className="modal-body">
        {jar.items.length > 0 ? (
          <>
            <p
              className="muted tip"
              data-tip={TIP_BUDGET}
              style={{ fontSize: 12, marginBottom: 8, cursor: "help" }}
            >
              <strong>Presupuesto sin frasco</strong> · ¿por qué aparece acá?
            </p>
            {jar.items.map((line) => (
              <OrphanRow key={line.id} line={line} currency={currency} cats={cats} onDone={onDone} />
            ))}
          </>
        ) : null}

        {jar.realItems.length > 0 ? (
          <>
            <p
              className="muted tip"
              data-tip={TIP_REAL}
              style={{
                fontSize: 12,
                margin: jar.items.length > 0 ? "16px 0 8px" : "0 0 8px",
                cursor: "help",
              }}
            >
              <strong>Gasto real sin frasco</strong> · ¿por qué aparece acá?
            </p>
            {jar.realItems.map((line) => (
              <RealOrphanRow
                key={line.id}
                line={line}
                currency={currency}
                cats={cats}
                onDone={onDone}
              />
            ))}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
