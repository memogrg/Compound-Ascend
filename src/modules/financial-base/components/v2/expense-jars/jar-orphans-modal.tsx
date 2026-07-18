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
} from "@/modules/financial-base/api/v2-actions";
import type { Jar, OrphanLine, OrphanReason } from "@/modules/financial-base/engine/expense-jars";
import type { Category } from "@/modules/financial-base/services/categories-service";

/** Destinos de reasignación: "{Grupo} (general)" + sus hojas, igual que el árbol. */
type CategoryGroup = { groupName: string; options: { id: string; name: string }[] };

/**
 * Arma los destinos desde las `categories` que la página ya cargó. No se
 * reutiliza listExpenseCategoriesAction (módulo control) a propósito: la
 * dependencia va control → financial-base, nunca al revés (CLAUDE.md).
 */
function buildCategoryGroups(categories: Category[]): CategoryGroup[] {
  const usable = categories.filter(
    (c) => c.isActive && (c.categoryType === "expense" || c.categoryType === "both"),
  );
  return usable
    .filter((c) => c.parentId == null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({
      groupName: g.name,
      options: [
        { id: g.id, name: `${g.name} (general)` },
        ...usable
          .filter((c) => c.parentId === g.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => ({ id: c.id, name: c.name })),
      ],
    }));
}

/** Etiqueta del chip por motivo. El engine solo emite los que puede probar. */
const REASON_LABEL: Record<OrphanReason, string> = {
  sin_categoria: "Sin categoría",
  categoria_oculta: "Categoría oculta",
  categoria_inactiva: "Categoría inactiva",
  categoria_inexistente: "Categoría borrada",
  no_renderizada: "Fuera de los frascos",
};

const TIP =
  "Estas líneas suman en tu presupuesto pero su categoría ya no se muestra " +
  "(se ocultó o se borró). Reasignalas para que vuelvan a su frasco.";

function OrphanRow({
  line,
  currency,
  cats,
  onDone,
}: {
  line: OrphanLine;
  currency: string;
  cats: CategoryGroup[];
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
  const cats = useMemo(() => buildCategoryGroups(categories), [categories]);
  const onDone = useCallback(() => router.refresh(), [router]);

  return (
    <Modal
      title={jar.name}
      sub={`${jar.items.length} ${jar.items.length === 1 ? "línea" : "líneas"} · ${formatMoney(jar.total, currency)}`}
      onClose={onClose}
    >
      <div className="modal-body">
        <p
          className="muted tip"
          data-tip={TIP}
          style={{ fontSize: 12, marginBottom: 8, cursor: "help" }}
        >
          ¿Por qué aparecen acá?
        </p>
        {jar.items.map((line) => (
          <OrphanRow
            key={line.id}
            line={line}
            currency={currency}
            cats={cats}
            onDone={onDone}
          />
        ))}
      </div>
    </Modal>
  );
}
